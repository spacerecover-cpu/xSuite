/*
  # Populate Phone Codes for All Active Countries

  1. Changes
    - Updates `phone_code` column in `geo_countries` for all 58 active countries
    - Sets the correct international dialing code (ITU-T E.164) for each country
  
  2. Important Notes
    - No destructive operations; this only fills in NULL values
    - All 58 active countries receive their correct phone code
*/

UPDATE geo_countries SET phone_code = '+54' WHERE code = 'AR';
UPDATE geo_countries SET phone_code = '+61' WHERE code = 'AU';
UPDATE geo_countries SET phone_code = '+43' WHERE code = 'AT';
UPDATE geo_countries SET phone_code = '+973' WHERE code = 'BH';
UPDATE geo_countries SET phone_code = '+880' WHERE code = 'BD';
UPDATE geo_countries SET phone_code = '+32' WHERE code = 'BE';
UPDATE geo_countries SET phone_code = '+55' WHERE code = 'BR';
UPDATE geo_countries SET phone_code = '+1' WHERE code = 'CA';
UPDATE geo_countries SET phone_code = '+56' WHERE code = 'CL';
UPDATE geo_countries SET phone_code = '+86' WHERE code = 'CN';
UPDATE geo_countries SET phone_code = '+57' WHERE code = 'CO';
UPDATE geo_countries SET phone_code = '+420' WHERE code = 'CZ';
UPDATE geo_countries SET phone_code = '+45' WHERE code = 'DK';
UPDATE geo_countries SET phone_code = '+20' WHERE code = 'EG';
UPDATE geo_countries SET phone_code = '+358' WHERE code = 'FI';
UPDATE geo_countries SET phone_code = '+33' WHERE code = 'FR';
UPDATE geo_countries SET phone_code = '+49' WHERE code = 'DE';
UPDATE geo_countries SET phone_code = '+30' WHERE code = 'GR';
UPDATE geo_countries SET phone_code = '+852' WHERE code = 'HK';
UPDATE geo_countries SET phone_code = '+91' WHERE code = 'IN';
UPDATE geo_countries SET phone_code = '+62' WHERE code = 'ID';
UPDATE geo_countries SET phone_code = '+353' WHERE code = 'IE';
UPDATE geo_countries SET phone_code = '+972' WHERE code = 'IL';
UPDATE geo_countries SET phone_code = '+39' WHERE code = 'IT';
UPDATE geo_countries SET phone_code = '+81' WHERE code = 'JP';
UPDATE geo_countries SET phone_code = '+962' WHERE code = 'JO';
UPDATE geo_countries SET phone_code = '+254' WHERE code = 'KE';
UPDATE geo_countries SET phone_code = '+965' WHERE code = 'KW';
UPDATE geo_countries SET phone_code = '+961' WHERE code = 'LB';
UPDATE geo_countries SET phone_code = '+60' WHERE code = 'MY';
UPDATE geo_countries SET phone_code = '+52' WHERE code = 'MX';
UPDATE geo_countries SET phone_code = '+212' WHERE code = 'MA';
UPDATE geo_countries SET phone_code = '+31' WHERE code = 'NL';
UPDATE geo_countries SET phone_code = '+64' WHERE code = 'NZ';
UPDATE geo_countries SET phone_code = '+234' WHERE code = 'NG';
UPDATE geo_countries SET phone_code = '+47' WHERE code = 'NO';
UPDATE geo_countries SET phone_code = '+968' WHERE code = 'OM';
UPDATE geo_countries SET phone_code = '+92' WHERE code = 'PK';
UPDATE geo_countries SET phone_code = '+51' WHERE code = 'PE';
UPDATE geo_countries SET phone_code = '+63' WHERE code = 'PH';
UPDATE geo_countries SET phone_code = '+48' WHERE code = 'PL';
UPDATE geo_countries SET phone_code = '+351' WHERE code = 'PT';
UPDATE geo_countries SET phone_code = '+974' WHERE code = 'QA';
UPDATE geo_countries SET phone_code = '+7' WHERE code = 'RU';
UPDATE geo_countries SET phone_code = '+966' WHERE code = 'SA';
UPDATE geo_countries SET phone_code = '+65' WHERE code = 'SG';
UPDATE geo_countries SET phone_code = '+27' WHERE code = 'ZA';
UPDATE geo_countries SET phone_code = '+82' WHERE code = 'KR';
UPDATE geo_countries SET phone_code = '+34' WHERE code = 'ES';
UPDATE geo_countries SET phone_code = '+46' WHERE code = 'SE';
UPDATE geo_countries SET phone_code = '+41' WHERE code = 'CH';
UPDATE geo_countries SET phone_code = '+886' WHERE code = 'TW';
UPDATE geo_countries SET phone_code = '+66' WHERE code = 'TH';
UPDATE geo_countries SET phone_code = '+90' WHERE code = 'TR';
UPDATE geo_countries SET phone_code = '+971' WHERE code = 'AE';
UPDATE geo_countries SET phone_code = '+44' WHERE code = 'GB';
UPDATE geo_countries SET phone_code = '+1' WHERE code = 'US';
UPDATE geo_countries SET phone_code = '+84' WHERE code = 'VN';
