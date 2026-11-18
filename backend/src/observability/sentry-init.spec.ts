import * as Sentry from '@sentry/nestjs';
import { initSentryIfConfigured } from './sentry-init';

jest.mock('@sentry/nestjs', () => ({ init: jest.fn() }));

describe('initSentryIfConfigured', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sin DSN no llama a Sentry.init', () => {
    initSentryIfConfigured(undefined, 'production');
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('con DSN llama a Sentry.init con el DSN y el entorno', () => {
    initSentryIfConfigured(
      'https://examplePublicKey@o0.ingest.sentry.io/0',
      'production',
    );
    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'production',
    });
  });
});
