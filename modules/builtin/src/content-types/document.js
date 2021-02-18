const base = require('./_base')
const path = require('path')
const utils = require('./_utils')

function render(data) {
  const events = []

  if (data.typing) {
    events.push({
      type: 'typing',
      value: data.typing
    })
  }

  return [
    ...events,
    {
      type: 'file',
      title: data.title,
      url: utils.formatURL(data.BOT_URL, data.document),
      collectFeedback: data.collectFeedback
    }
  ]
}

function renderTelegram(data) {
  const events = []

  if (data.typing) {
    events.push({
      type: 'typing',
      value: data.typing
    })
  }

  return [
    ...events,
    {
      type: 'document',
      url: utils.formatURL(data.BOT_URL, data.document)
    }
  ]
}

function renderElement(data, channel) {
  if (channel === 'telegram') {
    return renderTelegram(data)
  } else {
    return render(data)
  }
}

module.exports = {
  id: 'builtin_document',
  group: 'Built-in Messages',
  title: 'module.builtin.types.document.title',

  jsonSchema: {
    description: 'module.builtin.types.document.description',
    type: 'object',
    required: ['document'],
    properties: {
      document: {
        type: 'string',
        $subtype: 'media',
        $filter: '.jpg, .png, .jpeg, .gif, .txt, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx',
        title: 'module.builtin.types.document.title'
      },
      title: {
        type: 'string',
        title: 'module.builtin.types.document.documentLabel',
        description: 'module.builtin.types.document.labelDesc'
      },
      ...base.typingIndicators
    }
  },

  uiSchema: {
    title: {
      'ui:field': 'i18n_field'
    }
  },

  computePreviewText: formData => {
    if (!formData.document) {
      return
    }

    const link = utils.formatURL(formData.BOT_URL, formData.document)
    const title = formData.title ? ' | ' + formData.title : ''
    let fileName = ''

    if (utils.isUrl(link)) {
      fileName = path.basename(formData.document)
      if (fileName.includes('-')) {
        fileName = fileName
          .split('-')
          .slice(1)
          .join('-')
      }
      return `Document: [![${formData.title || ''}](<${link}>)](<${link}>) - (${fileName}) ${title}`
    } else {
      return `Expression: ${link}${title}`
    }
  },

  renderElement: renderElement
}
