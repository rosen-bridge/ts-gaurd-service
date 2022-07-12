import { anything, deepEqual, instance, mock, reset, spy, verify, when } from "ts-mockito";
import Dialer from "../../../src/communication/Dialer";

let mockedDialerInstance = mock(Dialer)
when(mockedDialerInstance.sendMessage(anything(), anything(), anything())).thenResolve()

let mockedDialer = spy(Dialer)
when(mockedDialer.getInstance()).thenResolve(instance(mockedDialerInstance))

/**
 * verifies Dialer sendMessage method called once for tx
 * @param channel
 * @param message
 */
const verifySendMessageCalledOnce = (channel: string, message: any): void => {
    verify(mockedDialerInstance.sendMessage(channel, deepEqual(message))).once()
}

export {
    verifySendMessageCalledOnce
}