import { anything, deepEqual, reset, spy, verify, when } from 'ts-mockito';
import { PaymentTransaction } from '../../../src/models/Models';
import { txAgreement } from '../../../src/guard/agreement/TxAgreement';

let mockedTxAgreement = spy(txAgreement);

/**
 * mocks txAgreement startAgreementProcess method when called for tx
 * @param tx
 */
const mockStartAgreementProcess = (tx: PaymentTransaction): void => {
  when(mockedTxAgreement.startAgreementProcess(deepEqual(tx))).thenResolve();
};

/**
 * verifies txAgreement startAgreementProcess method called once for tx
 * @param tx
 */
const verifyStartAgreementProcessCalledOnce = (
  tx: PaymentTransaction
): void => {
  verify(mockedTxAgreement.startAgreementProcess(tx)).once();
};

/**
 * verifies txAgreement startAgreementProcess method didn't get called
 */
const verifyStartAgreementProcessDidntGetCalled = (): void => {
  verify(mockedTxAgreement.startAgreementProcess(anything())).never();
};

/**
 * mocks txAgreement getChainPendingTransactions method to return txs when called
 * @param txs
 */
const mockGetChainPendingTransactions = (txs: PaymentTransaction[]): void => {
  when(mockedTxAgreement.getChainPendingTransactions(anything())).thenReturn(
    txs
  );
};

/**
 * resets mocked methods of txAgreement
 */
const resetMockedTxAgreement = (): void => {
  reset(mockedTxAgreement);
  mockedTxAgreement = spy(txAgreement);
};

export {
  mockStartAgreementProcess,
  verifyStartAgreementProcessCalledOnce,
  verifyStartAgreementProcessDidntGetCalled,
  mockGetChainPendingTransactions,
  resetMockedTxAgreement,
};
