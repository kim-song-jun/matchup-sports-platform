import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { CreateTournamentDto, UpdateTournamentDto } from './admin-tournament.dto';

describe.each([
  {
    name: '생성',
    metatype: CreateTournamentDto,
    base: {
      sportId: '00000000-0000-4000-8000-000000000001',
      title: '대회',
      teamCount: 8,
    },
  },
  {
    name: '수정',
    metatype: UpdateTournamentDto,
    base: { expectedVersion: '2026-10-22T00:00:00.000Z' },
  },
])('$name 대회 이미지 HTTP 입력 계약', ({ metatype, base }) => {
  const parse = (changes: object): Promise<CreateTournamentDto | UpdateTournamentDto> =>
    createGlobalValidationPipe().transform({ ...base, ...changes }, { type: 'body', metatype });

  it.each([true, false])('JSON boolean %p와 두 이미지 URL을 보존한다', async (showDetailImage) => {
    // Given
    const images = {
      listImageUrl: '/uploads/list.webp',
      coverImageUrl: '/uploads/detail.webp',
      showDetailImage,
    };

    // When
    const dto = await parse(images);

    // Then
    expect(dto).toMatchObject(images);
  });

  it('상세 노출 설정을 생략하면 undefined를 보존한다', async () => {
    // Given / When
    const dto = await parse({ listImageUrl: '/uploads/list.webp' });

    // Then
    expect(dto.showDetailImage).toBeUndefined();
  });

  it('상세 노출 설정의 명시적 null은 기존 optional 계약대로 보존한다', async () => {
    const dto = await parse({ showDetailImage: null });

    expect(dto.showDetailImage).toBeNull();
  });

  it.each([
    { name: '문자열 false', value: 'false' },
    { name: '문자열 true', value: 'true' },
    { name: '빈 문자열', value: '' },
    { name: '숫자 0', value: 0 },
    { name: '숫자 1', value: 1 },
    { name: '객체', value: {} },
    { name: '배열', value: [] },
  ])('JSON boolean이 아닌 $name 값은 상세 노출 필드 오류로 거절한다', async ({ value: showDetailImage }) => {
    // Given
    const images = {
      listImageUrl: '/uploads/list.webp',
      coverImageUrl: '/uploads/detail.webp',
      showDetailImage,
    };

    // When / Then
    await expect(parse(images)).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'showDetailImage' }],
      },
    });
  });

  it.each(['listImageUrl', 'coverImageUrl'] as const)('%s의 명시적 null을 보존한다', async (field) => {
    // Given / When
    const dto = await parse({ [field]: null, showDetailImage: false });

    // Then
    expect(dto[field]).toBeNull();
    expect(dto.showDetailImage).toBe(false);
  });

  it.each(['listImageUrl', 'coverImageUrl'] as const)('%s의 1000자 URL을 보존한다', async (field) => {
    // Given
    const url = 'x'.repeat(1000);

    // When
    const dto = await parse({ [field]: url });

    // Then
    expect(dto[field]).toBe(url);
  });

  it.each(['listImageUrl', 'coverImageUrl'] as const)('%s의 1001자 URL을 해당 필드 오류로 거절한다', async (field) => {
    // Given
    const images = { [field]: 'x'.repeat(1001), showDetailImage: false };

    // When / Then
    await expect(parse(images)).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_ERROR',
        details: [{ field }],
      },
    });
  });
});
