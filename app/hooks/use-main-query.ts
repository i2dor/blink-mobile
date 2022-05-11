import { useQuery } from "@apollo/client"
import { MAIN_QUERY } from "@app/graphql/query"
import useToken from "@app/utils/use-token"
import NetInfo from "@react-native-community/netinfo"
import { translateUnknown as translate } from "@galoymoney/client"
import crashlytics from "@react-native-firebase/crashlytics"

const useMainQuery = (): useMainQueryOutput => {
  const { hasToken } = useToken()
  const { data, previousData, error, loading, refetch } = useQuery(MAIN_QUERY, {
    variables: { hasToken },
    fetchPolicy: "cache-and-network",
  })
  let errors = []
  if (error) {
    if (error.graphQLErrors?.length > 0 && previousData) {
      // We got an error back from the server but we have data in the cache
      errors = [...error.graphQLErrors]
    }
    if (error.graphQLErrors?.length > 0 && !previousData) {
      // This is the first execution of mainquery and we received errors back from the server
      error.graphQLErrors.forEach((e) => {
        crashlytics().recordError(e)
        console.log(e)
      })
      throw new Error(
        "Error occurred during main query execution prior to cache population.  Unable to confirm if data necessary for proper execution of the app is present.",
      )
    }
    if (error.networkError && previousData) {
      // Call to mainquery has failed but we have data in the cache
      NetInfo.fetch().then((state) => {
        if (!state.isConnected) {
          // We failed to fetch the data because the device is offline
          errors.push({ message: translate("errors.network.connection") })
        } else {
          errors.push({ message: translate("errors.network.request") })
        }
      })
    }
    if (error.networkError && !previousData) {
      // This is the first execution of mainquery and it has failed
      crashlytics().recordError(error.networkError)
      // TODO: check if error is INVALID_AUTHENTICATION here
      // throw new Error(
      //   "Did not receive a response from main query.  Either the network is offline or servers are not responding.",
      // )
    }
  }
  const userPreferredLanguage = data?.me?.language
  const wallets = data?.me?.defaultAccount?.wallets
  const defaultWalletId = data?.me?.defaultAccount?.defaultWalletId
  const defaultWallet = wallets?.find((wallet) => wallet?.id === defaultWalletId)
  const btcWallet = wallets?.find((wallet) => wallet?.__typename === "BTCWallet")
  const usdWallet = wallets?.find((wallet) => wallet?.__typename === "UsdWallet")
  if (hasToken && !btcWallet && !loading) {
    // User is logged in but no wallet was returned.  We need a BTC wallet for the app to function.
    throw new Error(
      "Did not receive a BTC wallet for the default account.  Unable to load application data.",
    )
  }
  const btcWalletBalance = btcWallet?.balance
  const usdWalletBalance = usdWallet?.balance
  const btcWalletId = btcWallet?.id
  const usdWalletId = usdWallet?.id
  const btcTransactionsEdges = btcWallet?.transactions?.edges
  const usdTransactionsEdges = usdWallet?.transactions?.edges
  const me = data?.me || {}
  const myPubKey = data?.globals?.nodesIds?.[0] ?? ""
  const username = data?.me?.username
  const phoneNumber = data?.me?.phone
  const mobileVersions = data?.mobileVersions

  btcTransactionsEdges?.forEach((btcTransaction, index) => {
    const tx = btcTransaction
    tx.node = { ...tx.node, walletType: "BTC" }
    btcTransactionsEdges[index] = tx
  })
  usdTransactionsEdges?.forEach((usdTransaction, index) => {
    const tx = usdTransaction
    tx.node = { ...tx.node, walletType: "USD" }
    usdTransactionsEdges[index] = tx
  })
  const mergedTransactions = btcTransactionsEdges?.concat(usdTransactionsEdges)?.sort((a, b) => b.node.createdAt - a.node.createdAt)

  return {
    userPreferredLanguage,
    btcWalletBalance,
    usdWalletBalance,
    btcWalletId,
    usdWalletId,
    defaultWalletId,
    defaultWallet,
    btcTransactionsEdges,
    usdTransactionsEdges,
    mergedTransactions,
    wallets,
    me,
    myPubKey,
    username,
    phoneNumber,
    mobileVersions,
    loading,
    refetch,
    errors,
  }
}

export default useMainQuery