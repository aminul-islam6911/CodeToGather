#!/usr/bin/env node
// Validate the OpenAPI spec in CI (`API`). Usage: node scripts/validate-openapi.mjs [spec]
import SwaggerParser from "@apidevtools/swagger-parser";

const file = process.argv[2] ?? "openapi/openapi.yaml";

try {
  await SwaggerParser.validate(file);
  console.log(`OpenAPI valid: ${file}`);
} catch (error) {
  console.error(`OpenAPI invalid: ${file}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
