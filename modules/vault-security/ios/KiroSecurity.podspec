Pod::Spec.new do |s|
  s.name = 'KiroSecurity'
  s.version = '1.0.0'
  s.summary = 'Clipboard ownership and device lock notifications for Kiro Vault'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Kiro'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
