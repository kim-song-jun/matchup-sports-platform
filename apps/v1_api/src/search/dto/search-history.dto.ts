import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export const MAX_SEARCH_FILTERS_JSON_LENGTH = 2000;

function IsFiltersWithinSizeLimit(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isFiltersWithinSizeLimit',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          let serialized: string;
          try {
            serialized = JSON.stringify(value);
          } catch {
            return false;
          }
          return serialized.length <= MAX_SEARCH_FILTERS_JSON_LENGTH;
        },
        defaultMessage() {
          return `필터 정보가 너무 커요 (최대 ${MAX_SEARCH_FILTERS_JSON_LENGTH}자)`;
        },
      },
    });
  };
}

export class RecentSearchesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class RecordSearchDto {
  @IsString()
  @MaxLength(50)
  query!: string;

  @IsOptional()
  @IsObject()
  @IsFiltersWithinSizeLimit()
  filters?: Record<string, unknown>;
}
