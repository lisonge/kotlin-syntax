import { cp, mkdir } from 'node:fs/promises';

// Keep Kotlin's generated module and its relative WASM imports intact.
const destination = new URL('../public/parser/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../../kotlin-parser/dist/', import.meta.url), destination, { recursive: true });
