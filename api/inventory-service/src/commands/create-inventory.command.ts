export class CreateInventoryCommand {
  constructor(
    public readonly sku: string,
    public readonly availableQty: number,
  ) {}
}
