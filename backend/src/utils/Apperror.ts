class ApiError extends Error {
  public statuscode: number;

  public isOptional: boolean;
  constructor(statuscode: number, msg: string) {
    super(msg);
    this.isOptional = true;
    this.statuscode = statuscode;
    Object.setPrototypeOf(this,ApiError.prototype)
  }
}

export default ApiError;