#!/usr/bin/env python3
"""Fail closed on an incorrectly signed Rato App Store IPA; no secrets are printed."""
import datetime as dt
import hashlib
import json
import posixpath
import plistlib
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

BUNDLE = "com.ratoalsol.app"
TEAM = "F93LK4KK4P"


def validate(info, profile, signed_entitlements, leaf_certificate, expected_build):
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    require(info.get("CFBundleIdentifier") == BUNDLE, "Incorrect iOS bundle identifier")
    require(str(info.get("CFBundleVersion")) == str(expected_build), "Incorrect iOS build number")
    require("ProvisionedDevices" not in profile, "Profile is device-limited, not App Store")
    require(not profile.get("ProvisionsAllDevices", False), "Enterprise profile is not allowed")
    expiry = profile.get("ExpirationDate")
    require(isinstance(expiry, dt.datetime), "Missing profile expiration")
    require(expiry.replace(tzinfo=dt.timezone.utc) > dt.datetime.now(dt.timezone.utc), "Expired profile")
    require(TEAM in profile.get("TeamIdentifier", []), "Unexpected Apple team")
    entitlements = profile.get("Entitlements", {})
    require(entitlements.get("application-identifier") == TEAM + "." + BUNDLE, "Incorrect profile app identifier")
    require(entitlements.get("get-task-allow") is False, "Profile permits debugging")
    require(entitlements.get("beta-reports-active") is True, "Profile is not for App Store distribution")
    require(signed_entitlements.get("application-identifier") == TEAM + "." + BUNDLE, "Signed app identifier mismatch")
    require(signed_entitlements.get("com.apple.developer.team-identifier") == TEAM, "Signed team mismatch")
    require(signed_entitlements.get("get-task-allow", False) is False, "Signed app permits debugging")
    require(leaf_certificate in profile.get("DeveloperCertificates", []), "Signing certificate is not in profile")


def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def check_archive(archive):
    """Reject traversal, ambiguous paths and writes through ZIP symlinks before ditto."""
    links = {}
    seen = set()
    folded = set()
    for member in archive.infolist():
        name = member.filename.rstrip("/")
        normalized = posixpath.normpath(name)
        if not name or name.startswith("/") or normalized in (".", "..") or normalized.startswith("../") or "\\" in name or ".." in name.split("/"):
            raise ValueError("Unsafe path in IPA")
        if normalized.casefold() in folded:
            raise ValueError("Duplicate path in IPA")
        seen.add(normalized)
        folded.add(normalized.casefold())
        if stat.S_ISLNK(member.external_attr >> 16):
            if member.file_size > 4096:
                raise ValueError("Oversized symlink in IPA")
            target = archive.read(member).decode("utf-8")
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(normalized), target))
            if not target or target.startswith("/") or "\\" in target or resolved in (".", "..") or resolved.startswith("../"):
                raise ValueError("Unsafe symlink in IPA")
            links[normalized] = resolved
    for name in seen:
        parts = name.split("/")
        if any("/".join(parts[:i]) in links for i in range(1, len(parts))):
            raise ValueError("IPA writes through a symlink")
    for destination in links.values():
        parts = destination.split("/")
        if any("/".join(parts[:i]) in links for i in range(1, len(parts) + 1)):
            raise ValueError("IPA symlink points through another symlink")


def main():
    ipa, app_json = map(Path, sys.argv[1:3])
    config = json.loads(app_json.read_text(encoding="utf-8"))["expo"]
    expected_build = config["ios"]["buildNumber"]
    with tempfile.TemporaryDirectory(prefix="rato-ios-verify-") as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(ipa) as archive:
            check_archive(archive)
        # ditto retains executable modes and symlinks needed by codesign.
        run("/usr/bin/ditto", "-x", "-k", str(ipa.resolve()), str(root))
        apps = list((root / "Payload").glob("*.app"))
        if len(apps) != 1:
            raise ValueError("IPA must contain exactly one app")
        app = apps[0]
        with (app / "Info.plist").open("rb") as f:
            info = plistlib.load(f)
        profile = plistlib.loads(run("security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")))
        run("codesign", "--verify", "--deep", "--strict", str(app))
        signed_entitlements = plistlib.loads(run("codesign", "-d", "--entitlements", ":-", str(app)))
        run("codesign", "-d", "--extract-certificates", str(app), cwd=root)
        leaf = (root / "codesign0").read_bytes()
        validate(info, profile, signed_entitlements, leaf, expected_build)
        print("iOS App Store package verified:", BUNDLE, "build", expected_build)
        print("Signing certificate SHA-256:", hashlib.sha256(leaf).hexdigest())
        print("SDK version:", info.get("DTSDKName", "not recorded"))
        if not str(info.get("DTSDKName", "")).startswith("iphoneos"):
            raise ValueError("Build is not for the iPhone OS SDK")
        major = int(str(info["DTSDKName"])[len("iphoneos"):].split(".")[0])
        if major < 26:
            raise ValueError("App Store requires an iOS 26 or later SDK")


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as exc:
        print("iOS package verification failed:", str(exc), file=sys.stderr)
        sys.exit(1)
