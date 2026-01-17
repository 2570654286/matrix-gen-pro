import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes file paths by converting all backslashes to forward slashes.
 * This ensures cross-platform compatibility and consistent JSON serialization.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
