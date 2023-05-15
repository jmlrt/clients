import { InternalSendService } from "@bitwarden/common/tools/send/services/send.service.abstraction";

import { cryptoFunctionServiceFactory } from "../../platform/background/service-factories/crypto-function-service.factory";
import {
  CryptoServiceInitOptions,
  cryptoServiceFactory,
} from "../../platform/background/service-factories/crypto-service.factory";
import { BrowserSendService } from "../../services/browser-send.service";

import { FactoryOptions, CachedServices, factory } from "./factory-options";
import {
  i18nServiceFactory,
  I18nServiceInitOptions,
} from "../../platform/background/service-factories/i18n-service.factory";
import { stateServiceFactory, StateServiceInitOptions } from "./state-service.factory";

type SendServiceFactoryOptions = FactoryOptions;

export type SendServiceInitOptions = SendServiceFactoryOptions &
  CryptoServiceInitOptions &
  I18nServiceInitOptions &
  StateServiceInitOptions;

export function sendServiceFactory(
  cache: { sendService?: InternalSendService } & CachedServices,
  opts: SendServiceInitOptions
): Promise<InternalSendService> {
  return factory(
    cache,
    "sendService",
    opts,
    async () =>
      new BrowserSendService(
        await cryptoServiceFactory(cache, opts),
        await i18nServiceFactory(cache, opts),
        await cryptoFunctionServiceFactory(cache, opts),
        await stateServiceFactory(cache, opts)
      )
  );
}
