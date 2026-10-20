import { BadRequestException } from '@nestjs/common';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { SetMatchOnlineDto } from './set-match-online.dto';

describe('SetMatchOnlineDto', () => {
  const pipe = createGlobalValidationPipe();
  const transform = (isOnline: unknown) => pipe.transform(
    { isOnline },
    { type: 'body', metatype: SetMatchOnlineDto },
  ) as Promise<SetMatchOnlineDto>;

  it.each([true, false])('accepts the JSON boolean %s', async (isOnline) => {
    await expect(transform(isOnline)).resolves.toMatchObject({ isOnline });
  });

  it.each(['true', 'false', 1, 0, null])('rejects non-boolean JSON input %p', async (isOnline) => {
    await expect(transform(isOnline)).rejects.toBeInstanceOf(BadRequestException);
  });
});
