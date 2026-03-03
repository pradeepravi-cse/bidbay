import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column('int')
  availableQty: number;

  @Column('int', { default: 0 })
  reservedQty: number; // qty locked by PENDING orders

  @Column('int')
  get totalQty(): number {
    // virtual: availableQty + reservedQty
    return this.availableQty + this.reservedQty;
  }

  @VersionColumn()
  version: number; // optimistic locking — prevents race conditions

  @UpdateDateColumn()
  updatedAt: Date;
}
