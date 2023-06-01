import { mock, MockProxy } from "jest-mock-extended";

import { ApiService } from "../../abstractions/api.service";
import { AppIdService } from "../../abstractions/appId.service";
import { CryptoService } from "../../abstractions/crypto.service";
import { EnvironmentService } from "../../abstractions/environment.service";
import { LogService } from "../../abstractions/log.service";
import { MessagingService } from "../../abstractions/messaging.service";
import { PlatformUtilsService } from "../../abstractions/platformUtils.service";
import { StateService } from "../../abstractions/state.service";
import { Utils } from "../../misc/utils";
import {
  MasterKey,
  SymmetricCryptoKey,
  UserSymKey,
} from "../../models/domain/symmetric-crypto-key";
import { CsprngArray } from "../../types/csprng";
import { KeyConnectorService } from "../abstractions/key-connector.service";
import { TokenService } from "../abstractions/token.service";
import { TwoFactorService } from "../abstractions/two-factor.service";
import { UserApiLogInCredentials } from "../models/domain/log-in-credentials";

import { identityTokenResponseFactory } from "./login.strategy.spec";
import { UserApiLogInStrategy } from "./user-api-login.strategy";

describe("UserApiLogInStrategy", () => {
  let cryptoService: MockProxy<CryptoService>;
  let apiService: MockProxy<ApiService>;
  let tokenService: MockProxy<TokenService>;
  let appIdService: MockProxy<AppIdService>;
  let platformUtilsService: MockProxy<PlatformUtilsService>;
  let messagingService: MockProxy<MessagingService>;
  let logService: MockProxy<LogService>;
  let stateService: MockProxy<StateService>;
  let twoFactorService: MockProxy<TwoFactorService>;
  let keyConnectorService: MockProxy<KeyConnectorService>;
  let environmentService: MockProxy<EnvironmentService>;

  let apiLogInStrategy: UserApiLogInStrategy;
  let credentials: UserApiLogInCredentials;

  const deviceId = Utils.newGuid();
  const keyConnectorUrl = "KEY_CONNECTOR_URL";
  const apiClientId = "API_CLIENT_ID";
  const apiClientSecret = "API_CLIENT_SECRET";

  beforeEach(async () => {
    cryptoService = mock<CryptoService>();
    apiService = mock<ApiService>();
    tokenService = mock<TokenService>();
    appIdService = mock<AppIdService>();
    platformUtilsService = mock<PlatformUtilsService>();
    messagingService = mock<MessagingService>();
    logService = mock<LogService>();
    stateService = mock<StateService>();
    twoFactorService = mock<TwoFactorService>();
    keyConnectorService = mock<KeyConnectorService>();
    environmentService = mock<EnvironmentService>();

    appIdService.getAppId.mockResolvedValue(deviceId);
    tokenService.getTwoFactorToken.mockResolvedValue(null);
    tokenService.decodeToken.mockResolvedValue({});

    apiLogInStrategy = new UserApiLogInStrategy(
      cryptoService,
      apiService,
      tokenService,
      appIdService,
      platformUtilsService,
      messagingService,
      logService,
      stateService,
      twoFactorService,
      environmentService,
      keyConnectorService
    );

    credentials = new UserApiLogInCredentials(apiClientId, apiClientSecret);
  });

  it("sends api key credentials to the server", async () => {
    apiService.postIdentityToken.mockResolvedValue(identityTokenResponseFactory());
    await apiLogInStrategy.logIn(credentials);

    expect(apiService.postIdentityToken).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: apiClientId,
        clientSecret: apiClientSecret,
        device: expect.objectContaining({
          identifier: deviceId,
        }),
        twoFactor: expect.objectContaining({
          provider: null,
          token: null,
        }),
      })
    );
  });

  it("sets the local environment after a successful login", async () => {
    apiService.postIdentityToken.mockResolvedValue(identityTokenResponseFactory());

    await apiLogInStrategy.logIn(credentials);

    expect(stateService.setApiKeyClientId).toHaveBeenCalledWith(apiClientId);
    expect(stateService.setApiKeyClientSecret).toHaveBeenCalledWith(apiClientSecret);
    expect(stateService.addAccount).toHaveBeenCalled();
  });

  it("sets the encrypted user symmetric key and private key from the identity token response", async () => {
    const tokenResponse = identityTokenResponseFactory();

    apiService.postIdentityToken.mockResolvedValue(tokenResponse);

    await apiLogInStrategy.logIn(credentials);

    expect(cryptoService.setUserSymKeyMasterKey).toHaveBeenCalledWith(tokenResponse.key);
    expect(cryptoService.setPrivateKey).toHaveBeenCalledWith(tokenResponse.privateKey);
  });

  it("gets and sets the master key if Key Connector is enabled", async () => {
    const tokenResponse = identityTokenResponseFactory();
    tokenResponse.apiUseKeyConnector = true;

    apiService.postIdentityToken.mockResolvedValue(tokenResponse);
    environmentService.getKeyConnectorUrl.mockReturnValue(keyConnectorUrl);

    await apiLogInStrategy.logIn(credentials);

    expect(keyConnectorService.getAndSetMasterKey).toHaveBeenCalledWith(keyConnectorUrl);
  });

  it("decrypts and sets the user symmetric key if Key Connector is enabled", async () => {
    const userSymKey = new SymmetricCryptoKey(
      new Uint8Array(64).buffer as CsprngArray
    ) as UserSymKey;
    const masterKey = new SymmetricCryptoKey(new Uint8Array(64).buffer as CsprngArray) as MasterKey;

    const tokenResponse = identityTokenResponseFactory();
    tokenResponse.apiUseKeyConnector = true;

    apiService.postIdentityToken.mockResolvedValue(tokenResponse);
    environmentService.getKeyConnectorUrl.mockReturnValue(keyConnectorUrl);
    cryptoService.getMasterKey.mockResolvedValue(masterKey);
    cryptoService.decryptUserSymKeyWithMasterKey.mockResolvedValue(userSymKey);

    await apiLogInStrategy.logIn(credentials);

    expect(cryptoService.decryptUserSymKeyWithMasterKey).toHaveBeenCalledWith(masterKey);
    expect(cryptoService.setUserKey).toHaveBeenCalledWith(userSymKey);
  });
});
