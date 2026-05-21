import { formatShortTimestamp } from './timestamp';

describe('formatShortTimestamp', () => {
  const ORIGINAL_TZ = process.env.TZ;
  const ORIGINAL_TIME_ZONE = process.env.TIME_ZONE;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
    if (ORIGINAL_TIME_ZONE === undefined) delete process.env.TIME_ZONE;
    else process.env.TIME_ZONE = ORIGINAL_TIME_ZONE;
  });

  it('should format in UTC by default when no TZ or TIME_ZONE is set', () => {
    // Arrange
    delete process.env.TZ;
    delete process.env.TIME_ZONE;
    const date = new Date('2026-05-19T14:23:45.123Z');

    // Act
    const out = formatShortTimestamp(date);

    // Assert
    expect(out).toBe('14:23:45.123');
  }, 1000);

  it('should pad milliseconds to three digits', () => {
    // Arrange
    delete process.env.TZ;
    delete process.env.TIME_ZONE;
    const date = new Date('2026-05-19T14:23:45.007Z');

    // Act
    const out = formatShortTimestamp(date);

    // Assert
    expect(out).toBe('14:23:45.007');
  }, 1000);

  it('should honor the TZ environment variable', () => {
    // Arrange
    delete process.env.TIME_ZONE;
    process.env.TZ = 'America/Sao_Paulo';                       // fixed at UTC-03:00
    const date = new Date('2026-05-19T14:23:45.123Z');

    // Act
    const out = formatShortTimestamp(date);

    // Assert
    expect(out).toBe('11:23:45.123');
  }, 1000);

  it('should honor the TIME_ZONE environment variable when TZ is unset', () => {
    // Arrange
    delete process.env.TZ;
    process.env.TIME_ZONE = 'Asia/Tokyo';                       // fixed at UTC+09:00
    const date = new Date('2026-05-19T14:23:45.123Z');

    // Act
    const out = formatShortTimestamp(date);

    // Assert
    expect(out).toBe('23:23:45.123');
  }, 1000);

  it('should prefer TZ over TIME_ZONE when both are set', () => {
    // Arrange
    process.env.TZ = 'UTC';
    process.env.TIME_ZONE = 'Asia/Tokyo';
    const date = new Date('2026-05-19T14:23:45.123Z');

    // Act
    const out = formatShortTimestamp(date);

    // Assert
    expect(out).toBe('14:23:45.123');
  }, 1000);
});