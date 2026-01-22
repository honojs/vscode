export type RequestLensCommandArgs = {
  /**
   * Route path literal extracted from code (e.g. "/hello").
   */
  path: string
  /**
   * HTTP method (lowercase) extracted from code (e.g. "get").
   */
  method: string
  /**
   * File URI that contained the route.
   */
  uri: string
  /**
   * Line number where the route call was detected.
   */
  line?: number
  /**
   * Pre-defined JSON body from @example in JSDoc.
   */
  jsonBody?: string
  /**
   * Content-Type header (e.g. "application/json").
   */
  contentType?: string
}
