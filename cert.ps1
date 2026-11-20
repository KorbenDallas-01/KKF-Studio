$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=KKF Studio Test" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy NonExportable `
  -NotAfter (Get-Date).AddYears(2)

$cert | Select-Object Subject, Thumbprint, NotAfter