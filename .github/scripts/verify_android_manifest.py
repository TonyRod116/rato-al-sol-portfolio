#!/usr/bin/env python3
"""Validate decoded AAB manifest without printing the Google Maps API key."""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID = "{http://schemas.android.com/apk/res/android}"
BUNDLE = "com.ratoalsol.app"


def inspect(root, expected_build):
    if root.get("package") != BUNDLE:
        raise ValueError("Unexpected Android package")
    if root.get(ANDROID + "versionCode") != str(expected_build):
        raise ValueError("Unexpected Android version code")
    uses_sdk = root.find("uses-sdk")
    if uses_sdk is None:
        raise ValueError("Missing target SDK")
    try:
        target = int(uses_sdk.get(ANDROID + "targetSdkVersion", ""))
    except ValueError:
        raise ValueError("Target SDK is not a numeric API level") from None
    if target < 36:
        raise ValueError("Target SDK must be 36 or later")
    app = root.find("application")
    if app is None:
        raise ValueError("Missing application element")
    if app.get(ANDROID + "debuggable", "false").lower() != "false":
        raise ValueError("Android bundle is debuggable or has an unresolved debug flag")
    maps = [x for x in app.findall("meta-data") if x.get(ANDROID + "name") == "com.google.android.geo.API_KEY"]
    value = maps[0].get(ANDROID + "value", "") if len(maps) == 1 else ""
    if not value or "${" in value or value.startswith("@"):
        raise ValueError("Missing or unresolved Google Maps key")
    permissions = sorted({x.get(ANDROID + "name", "") for x in root if x.tag in {"uses-permission", "uses-permission-sdk-23"}})
    forbidden = {"android.permission.ACCESS_BACKGROUND_LOCATION", "android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.SYSTEM_ALERT_WINDOW"}
    if forbidden.intersection(permissions):
        raise ValueError("Unexpected sensitive permission; review merged manifest")
    return target, permissions


def main():
    manifest, config_file = map(Path, sys.argv[1:3])
    build = json.loads(config_file.read_text(encoding="utf-8"))["expo"]["android"]["versionCode"]
    target, permissions = inspect(ET.parse(manifest).getroot(), build)
    print("Android package verified:", BUNDLE, "version", build, "target", target)
    print("Manifest permissions:", ", ".join(permissions))
    print("Google Maps key: present (value hidden)")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, ET.ParseError) as exc:
        print("Android manifest verification failed:", str(exc), file=sys.stderr)
        sys.exit(1)
