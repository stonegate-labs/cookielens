declare module 'json-bigint' {
  export default function JSONbig(options?: {
    storeAsString?: boolean;
    alwaysParseAsBig?: boolean;
    protoAction?: string;
    constructorAction?: string;
  }): { parse(text: string): unknown };
}
