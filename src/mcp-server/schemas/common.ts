import { z } from 'zod';

export const profileIdSchema = z.string().min(1).max(64);
export const localPathSchema = z.string().min(1).max(32_768);
export const remotePathSchema = z.string().min(1).max(4096);
export const hostSchema = z.string().min(1).max(253);
export const portSchema = z.number().int().min(1).max(65535);
export const fingerprintSchema = z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/);
export const modeSchema = z.number().int().min(0).max(0o7777);
