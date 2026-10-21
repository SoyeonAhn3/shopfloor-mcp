import { existsSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Only directories created by this project directly under the OS temp directory.
export function removeOwnedTemp(directory: string): void {
  if (!existsSync(directory)) return;
  const target = realpathSync(directory), parent = realpathSync(tmpdir());
  if (resolve(dirname(target)) !== resolve(parent) || !basename(target).startsWith('shopfloor-')) {
    throw new Error('Refusing to remove an unowned temporary directory: '+target);
  }
  rmSync(target,{recursive:true,force:true});
}
