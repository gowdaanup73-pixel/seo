// domainValidator.js - DNS domain validation
class DomainValidator {
  async validate(url) {
    console.log('🔍 Validating domain:', url);
    
    try {
      // Extract hostname
      let hostname;
      try {
        const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
        hostname = urlObj.hostname;
      } catch {
        return { valid: false, error: 'Invalid URL format', domain: url };
      }
      
      // Check DNS using Google DNS API
      const dnsUrl = `${CONFIG.DNS_API}${hostname}&type=A`;
      console.log('📡 Checking DNS:', dnsUrl);
      
      const response = await fetch(dnsUrl);
      const data = await response.json();
      
      console.log('DNS Response:', data);
      
      if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
        console.log('✅ Domain is registered and valid');
        return { valid: true, domain: hostname };
      } else if (data.Status === 3) {
        console.log('❌ Domain not found (NXDOMAIN)');
        return { valid: false, error: 'Domain not registered', domain: hostname };
      } else {
        console.log('⚠️ DNS error:', data.Status);
        return { valid: false, error: 'Could not validate domain', domain: hostname };
      }
    } catch (error) {
      console.error('❌ Validation error:', error);
      return { valid: false, error: error.message, domain: url };
    }
  }
}

window.DomainValidator = DomainValidator;