/** HTTP-level error with status (400 server validation, 412 concurrency, 404 not found). */
export class SharePointRequestError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, SharePointRequestError.prototype);
  }
}

/** Extracts status and a readable message from a PnPjs HttpRequestError. */
export async function toRequestError(e: unknown): Promise<SharePointRequestError> {
  const error = e as { status?: number; message?: string; response?: { clone?: () => { json(): Promise<unknown> } } };
  let message = error && error.message ? error.message : String(e);
  try {
    if (error && error.response && error.response.clone) {
      const body = (await error.response.clone().json()) as {
        'odata.error'?: { message?: { value?: string } };
        error?: { message?: string | { value?: string } };
      };
      const odata = body['odata.error'];
      if (odata && odata.message && odata.message.value) message = odata.message.value;
      else if (body.error && body.error.message) {
        message = typeof body.error.message === 'string' ? body.error.message : body.error.message.value || message;
      }
    }
  } catch {
    // keep the original message
  }
  return new SharePointRequestError(message, error && typeof error.status === 'number' ? error.status : 0);
}
