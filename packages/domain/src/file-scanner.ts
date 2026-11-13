import { spawn } from 'node:child_process';
import path from 'node:path';
export type ScanResult = 'clean' | 'rejected' | 'unavailable';
export type Scanner = (file: string) => Promise<ScanResult>;
/** No shell, bounded execution and no content-bearing process output. */
export const scanFile: Scanner = async (file) => {
  const binary = process.env.CLAMSCAN_PATH;
  if (!binary || !path.isAbsolute(binary)) return 'unavailable';
  const args = [
    '--no-summary',
    '--alert-exceeds-max',
    '--alert-encrypted',
    '--max-filesize=20M',
    '--max-scansize=100M',
    '--max-recursion=10',
  ];
  if (process.env.CLAMSCAN_DATABASE) args.push('--database=' + process.env.CLAMSCAN_DATABASE);
  args.push('--', file);
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
      timeout: 90000,
      killSignal: 'SIGKILL',
    });
    child.once('error', () => resolve('unavailable'));
    child.once('close', (code) =>
      resolve(code === 0 ? 'clean' : code === 1 ? 'rejected' : 'unavailable'),
    );
  });
};
