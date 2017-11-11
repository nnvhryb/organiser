import 'babel-polyfill'
import { parse as parseUrl } from 'url'
import { buildContext } from '../context'
import { resolveRequestArguments } from '../../injections'
import debug from '../../debug'

function onEnd (method, input, timing) {
  return () => {
    const diff = process.hrtime(timing)
    debug.log.info(`(${method}): ${input}`)
    debug.log.info(`Request processed in ${diff[0]}s ${diff[1] / 1000000}ms.`)
  }
}

export const flow = async function (instance, request, response, requestedAt) {
  const instanceModifiers = instance._modifiers
  // run server (before) modifiers
  await instanceModifiers.before.execute()
  // route parsing
  const router = instance._router
  const parsed = parseUrl(request.url, true)
  const input = parsed.pathname.replace(/\/{2,}/g, '/')
  const route = router.find(input, request.method)
  if (route) {
    const routeData = route.data
    const routeModules = routeData.modules
    const context = buildContext(instance, request, response, requestedAt)
    // run controller (before) modifiers
    let final = await routeModules.before.execute(context)
    if (final === undefined) {
      const resolver = routeData.resolver
      const args = resolveRequestArguments(context, resolver, route.params)
      // run controller method
      final = await resolver.controller[resolver.method](args)
      // run controller (after) modifiers
      const controllerAfter = await routeModules.after.execute(context, final)
      if (controllerAfter !== undefined) final = controllerAfter
      // run server (before) modifiers
      const serverAfter = await instanceModifiers.after.execute(context, final)
      if (serverAfter !== undefined) final = serverAfter
    }
    router.terminate(response, final, instance.options.internal.debug ? onEnd(request.method, input, requestedAt) : undefined)
  } else {
    router.terminate(response, instance._onEndpointNotFound(input, request))
  }
}