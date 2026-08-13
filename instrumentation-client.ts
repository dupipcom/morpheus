import { initBotId } from 'botid/client/core'

initBotId({
  protect: [
    {
      path: '/api/v1/*',
      method: '*',
    },
  ],
})
