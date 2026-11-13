export const EXTRACTION_ERRORS: Record<string, string> = {
  tool_unavailable:
    'A required PDF/OCR tool is unavailable. Ask the operator to configure it, or enter findings manually.',
  sandbox_required: 'The production extraction sandbox has not been configured.',
  no_text: 'No readable text was found. Use a clearer scan or enter findings manually.',
  encrypted_document:
    'Password-protected documents cannot be extracted. Supply an authorised unencrypted copy.',
  page_limit:
    'The document exceeds the 20-page extraction limit. Supply a smaller relevant excerpt.',
  text_limit: 'The extracted text exceeds the limit. Supply a smaller relevant excerpt.',
  image_limit: 'The image is invalid or exceeds the 25-megapixel limit.',
  unsafe_document:
    'The document contains unsupported active, external, encrypted or oversized content.',
  invalid_encoding: 'The text is not valid UTF-8. Save a UTF-8 copy or use manual entry.',
  source_changed: 'The source file changed or is unavailable. Upload a new copy for scanning.',
  scan_rejected: 'The file was rejected or deleted; extraction is blocked.',
  access_revoked: 'Access or enrolment status changed. The result was not published.',
  interrupted: 'Extraction was interrupted. Request a new attempt or enter findings manually.',
  timeout: 'Extraction exceeded its time limit. Use a smaller excerpt or manual entry.',
  parser_failed: 'Extraction could not read this document. Use a supported copy or manual entry.',
};
