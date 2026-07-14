import { NextResponse } from 'next/server';

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const created = (data: unknown) => NextResponse.json(data, { status: 201 });
export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const notFound = (error: string) => NextResponse.json({ error }, { status: 404 });
export const serverError = (error: string) => NextResponse.json({ error }, { status: 500 });

/** Wrap a handler so thrown errors become clean JSON (400 by default). */
export async function guard(
  fn: () => Promise<NextResponse>,
  errorStatus: 400 | 500 = 400
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: errorStatus });
  }
}
