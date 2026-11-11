Pod::Spec.new do |s|
  s.name = 'RatoShadowRaster'
  s.version = '1.0.0'
  s.summary = 'Native shadow mask renderer for Rato al Sol'
  s.description = 'Local bitmap renderer for estimated building shadows.'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Rato al Sol'
  s.homepage = 'https://tony-r.com/rato-al-sol/'
  s.source = { :git => 'https://github.com/TonyRod116/rato-al-sol.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
