export default () => ({
  port: parseInt(process.env.API_PORT || '8111', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379/0',
  },
  jwt: {
    secret: (() => {
      if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
      if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
      return 'dev-secret';
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  auth: {
    hashDriver: process.env.AUTH_HASH_DRIVER || 'bcryptjs',
  },
  oauth: {
    kakao: {
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
      redirectUri: process.env.KAKAO_REDIRECT_URI,
    },
    naver: {
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
      redirectUri: process.env.NAVER_REDIRECT_URI,
    },
  },
  toss: {
    clientKey: process.env.TOSS_CLIENT_KEY,
    secretKey: process.env.TOSS_SECRET_KEY,
  },
  aws: {
    region: process.env.AWS_REGION || 'ap-northeast-2',
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
});
