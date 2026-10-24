import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function outputDirectory(): Promise<URL> {
  const directory = process.env.BENCH_OUTPUT_DIR
    ? pathToFileURL(resolve(process.env.BENCH_OUTPUT_DIR) + sep)
    : new URL('../build/benchmarks/', import.meta.url);
  await mkdir(directory, { recursive: true });
  return directory;
}
