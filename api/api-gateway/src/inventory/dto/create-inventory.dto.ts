import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateInventoryDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber()
  @Min(0)
  availableQty: number;
}
