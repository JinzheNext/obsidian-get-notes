export class GetApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GetApiError";
    this.status = status;
  }
}
