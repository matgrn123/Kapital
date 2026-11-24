export class ErreurDemarrage extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurDemarrage";
  }
}
