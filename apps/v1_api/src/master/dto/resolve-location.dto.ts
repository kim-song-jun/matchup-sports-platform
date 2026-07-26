import { Type } from 'class-transformer';
import { Equals, IsBoolean, IsNumber, Max, Min } from 'class-validator';

export class ResolveLocationDto {
  @IsBoolean()
  @Equals(true, { message: '현재 위치 전송에 명시적으로 동의해 주세요.' })
  locationConsentAccepted!: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
