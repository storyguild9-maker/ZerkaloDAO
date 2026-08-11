import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tolk',
    entrypoint: 'contracts/testnet_gram_distributor.tolk',
    withStackComments: true,
    withSrcLineComments: true,
    experimentalOptions: '',
};
