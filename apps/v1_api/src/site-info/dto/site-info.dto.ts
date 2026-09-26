import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** 형식 검증은 값이 있을 때만 — 빈 문자열·null 은 "지우기" 요청이다(IsOptional 필드와 같은 취급). */
const hasValue = (_: object, value: unknown) => value !== undefined && value !== null && value !== '';

/**
 * PUT /admin/site-info 바디. 필드가 없으면 기존 값 유지, 빈 문자열("")이면 값 삭제,
 * 비어있지 않은 문자열이면 그 값으로 저장한다(UpdateIntegrationSettingsDto 와 같은 시맨틱).
 */
export class UpdateSiteInfoDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100, { message: '상호는 100자를 넘을 수 없어요.' })
  companyName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50, { message: '대표자 이름은 50자를 넘을 수 없어요.' })
  representativeName?: string;

  @ValidateIf(hasValue)
  @Transform(trim)
  @IsString()
  @Matches(/^\d{3}-\d{2}-\d{5}$/, { message: '사업자등록번호는 000-00-00000 형식으로 입력해주세요.' })
  businessRegistrationNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: '주소는 200자를 넘을 수 없어요.' })
  address?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50, { message: '통신판매업 신고번호는 50자를 넘을 수 없어요.' })
  mailOrderSalesNumber?: string;

  @ValidateIf(hasValue)
  @Transform(trim)
  @IsString()
  @MaxLength(254, { message: '연락 이메일은 254자를 넘을 수 없어요.' })
  @IsEmail({}, { message: '이메일 형식이 올바르지 않아요.' })
  contactEmail?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100, { message: '문의 보관 기간 안내는 100자를 넘을 수 없어요.' })
  guestInquiryRetention?: string;
}
