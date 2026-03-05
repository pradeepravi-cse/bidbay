export class UpdateInventoryCommand {
  constructor(
    public readonly sku: string,
    public readonly availableQty: number,
  ) {}
}
