/** Application errors the HTTP layer maps to status codes by name: 404 and 400; anything else is a 500. */
export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

export class ValidationError extends Error {
  override readonly name: string = 'ValidationError';
}
