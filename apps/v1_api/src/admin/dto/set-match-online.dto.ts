import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class SetMatchOnlineDto {
  // Global implicit conversion turns strings (including "false") into truthy/boolean values.
  // Validate the original JSON value so only literal booleans cross this mutation boundary.
  @Transform(({ obj, key, value }) => (
    obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : value
  ))
  @IsBoolean()
  isOnline!: boolean;
}
