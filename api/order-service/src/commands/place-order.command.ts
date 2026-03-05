/**
 * CQRS — COMMAND
 * ──────────────
 * A Command is a plain class that carries the INTENT to change state.
 * It is dispatched via CommandBus and handled by exactly ONE handler.
 *
 * Naming convention: <Verb><Noun>Command  →  PlaceOrderCommand
 *
 * Commands MUST NOT be used to return data to the caller beyond a minimal
 * acknowledgement (here: the new orderId + status). All reads go through
 * Queries instead.
 */
import { OrderItem } from '../entities/order.entity';

export class PlaceOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly items: OrderItem[],
  ) {}
}
