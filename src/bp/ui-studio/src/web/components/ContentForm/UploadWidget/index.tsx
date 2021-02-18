import axios from 'axios'
import { FormFields, lang } from 'botpress/shared'
import cn from 'classnames'
import React, { FC, Fragment, useState } from 'react'
import { AccessControl } from '~/components/Shared/Utils'
import style from '~/views/FlowBuilder/sidePanelTopics/form/style.scss'

import { isBpUrl } from '../../../../../../common/url'

import localStyle from './style.scss'
import UrlUpload from './UrlUpload'
interface IUploadWidgetProps {
  value: string | null
  onChange(value: string | null): void
  schema: {
    type: string
    contentType: string
    $subtype: string
    $filter: string
    title: string
  }
}

const UploadWidget: FC<IUploadWidgetProps> = props => {
  const { value } = props
  const [error, setError] = useState<string | Error>(null)
  const [enterUrlManually, setEnterUrlManually] = useState(false)

  React.useEffect(() => {
    if (value) {
      setEnterUrlManually(!isBpUrl(value))
    }
  }, [])

  const onError = (error: string | Error) => {
    setError(error)
  }

  const onChange = (value: string | null) => {
    props.onChange(value)
    setError(null)
  }

  const onDelete = () => {
    props.onChange(null)
  }

  const handleToggleManually = () => {
    setEnterUrlManually(!enterUrlManually)
    setError(null)
  }

  const { $subtype: subtype, type, contentType } = props.schema
  if (type !== 'string' || subtype !== 'media') {
    return null
  }

  let enterUrlChoice = 'module.builtin.types.image.enterUrlChoice'
  let uploadFileChoice = 'module.builtin.types.image.uploadFileChoice'

  if (contentType === 'document') {
    enterUrlChoice = 'module.builtin.types.document.enterUrlChoice'
    uploadFileChoice = 'module.builtin.types.document.uploadFileChoice'
  }

  return (
    <AccessControl
      operation="write"
      resource="bot.media"
      fallback={<em>{lang.tr('module.builtin.types.image.permissionDenied')}</em>}
    >
      <Fragment>
        {((enterUrlManually && value) || !enterUrlManually) && (
          <FormFields.Upload
            axios={axios.create({ baseURL: window.BOT_API_PATH })}
            onChange={onChange}
            value={value}
            contentType={contentType}
          />
        )}

        {enterUrlManually && !value && (
          <UrlUpload value={value} onChange={onChange} onError={onError} onDelete={onDelete} />
        )}

        {!value && (
          <div className={localStyle.fieldContainer}>
            <a className={localStyle.toggleLink} onClick={handleToggleManually}>
              {!enterUrlManually ? lang.tr(enterUrlChoice) : lang.tr(uploadFileChoice)}
            </a>

            {error && <p className={cn(style.fieldError, localStyle.fieldError)}>{error}</p>}
          </div>
        )}
      </Fragment>
    </AccessControl>
  )
}

export default UploadWidget
