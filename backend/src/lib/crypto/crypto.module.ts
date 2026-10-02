import { Module } from '@nestjs/common';
import { SecretBoxService } from './secret_box.service';

/** Encryption of secrets at rest. */
@Module({
  providers: [SecretBoxService],
  exports: [SecretBoxService],
})
export class CryptoModule {}
