import { anything, reset, spy, verify, when } from "ts-mockito";
import ExplorerApi from "../../../../src/chains/ergo/network/ExplorerApi";
import { Boxes, CoveringErgoBoxes } from "../../../../src/chains/ergo/models/Interfaces";


let mockedExplorer = spy(ExplorerApi)

/**
 * mocks ExplorerApi getCoveringErgAndTokenForAddress method to return returnBoxes when called for an address ergoTree
 * @param ergoTree
 * @param returnBoxes
 */
const mockGetCoveringErgAndTokenForErgoTree = (ergoTree: string, returnBoxes: CoveringErgoBoxes): void => {
    when(mockedExplorer.getCoveringErgAndTokenForErgoTree(
        ergoTree,
        anything()
    )).thenResolve(returnBoxes)
    when(mockedExplorer.getCoveringErgAndTokenForErgoTree(
        ergoTree,
        anything(),
        anything()
    )).thenResolve(returnBoxes)
}

/**
 * mocks ExplorerApi getBoxesForErgoTree method to return returnBoxes when called for an address ergoTree
 * @param ergoTree
 * @param returnBoxes
 */
const mockGetBoxesForErgoTree = (ergoTree: string, returnBoxes: Boxes): void => {
    const singleReturn: Boxes = {
        items: [returnBoxes.items[0]],
        total: returnBoxes.total
    }
    when(mockedExplorer.getBoxesForErgoTree(ergoTree, 0, 1)).thenResolve(singleReturn)

    for (let i = 0; i < returnBoxes.total; i += 10) {
        const roundReturn: Boxes = {
            items: returnBoxes.items.slice(i, i + 10),
            total: returnBoxes.total
        }
        when(mockedExplorer.getBoxesForErgoTree(ergoTree, i, 10)).thenResolve(roundReturn)
    }
}

/**
 * mocks ExplorerApi getTxConfirmation method to return confirmation when called for txId
 * @param txId
 * @param confirmation
 */
const mockExplorerGetTxConfirmationCalledOnce = (txId: string, confirmation: number): void => {
    when(mockedExplorer.getTxConfirmation(txId)).thenResolve(confirmation)
}

/**
 * resets mocked methods of ExplorerApi
 */
const resetMockedExplorerApi = (): void => {
    reset(mockedExplorer)
    mockedExplorer = spy(ExplorerApi)
}

export {
    mockGetCoveringErgAndTokenForErgoTree,
    mockGetBoxesForErgoTree,
    mockExplorerGetTxConfirmationCalledOnce,
    resetMockedExplorerApi
}
