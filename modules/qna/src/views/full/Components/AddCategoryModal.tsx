import { Button, Classes, Dialog, FormGroup, InputGroup, Switch, TagInput, Slider } from '@blueprintjs/core'
import React, { FC, useState } from 'react'

interface Props {
  axios: any
  isOpen: boolean
  toggle: () => void
  languages: string[]
}

const AddCategoryModal: FC<Props> = props => {
  const [name, setName] = useState('')
  const [contexts, setContexts] = useState(['global'])
  const [precision, setPrecision] = useState(80)
  const [enabled, setStatus] = useState(true)

  const [validName, setValidName] = useState(true)
  const [validContext, setValidСontext] = useState(true)

  const handleClose = () => {
    props.toggle()

    setName('')
    setContexts(['global'])
    setPrecision(80)
    setStatus(true)
    setValidName(true)
    setValidСontext(true)
  }

  const handleChangeName = event => {
    setName(event.target.value)
    setValidName(true)
  }

  const handleChangeContext = values => {
    setContexts(values)
    setValidСontext(true)
  }

  const handleChangePrecision = value => {
    setPrecision(value)
  }

  const handleChangeStatus = () => {
    setStatus(!enabled)
  }

  const handleSubmitForm = () => {
    if (validateForm()) {
      console.log(name, contexts, precision, enabled, props.languages)
      props.axios
        .post('/mod/qna/category', { id: Date.now(), name, contexts, precision, enabled, languages: props.languages })
        .then(response => {
          console.log(response.data)
        })
        .catch(error => {
          console.log(error)
        })
    }
  }

  const validateForm = () => {
    let valid = true
    if (!name.trim()) {
      setValidName(false)
      valid = false
    }
    if (!contexts.length) {
      setValidСontext(false)
      valid = false
    }
    return valid
  }

  return (
    <div>
      <Dialog icon="add" onClose={handleClose} title="Добавить категорию" isOpen={props.isOpen}>
        <div className={Classes.DIALOG_BODY}>
          <FormGroup
            label="Название"
            labelFor="add-qnq-category-input"
            labelInfo="*"
            helperText={!validName && 'Это обязательное поле'}
            intent={validName ? 'none' : 'danger'}
          >
            <InputGroup
              id="add-qnq-category-input"
              placeholder="Укажите название категории"
              intent={validName ? 'none' : 'danger'}
              onChange={handleChangeName}
              value={name}
            />
          </FormGroup>

          <FormGroup
            label="Базовый контекст"
            labelInfo="*"
            helperText={!validContext && 'Это обязательное поле'}
            intent={validContext ? 'none' : 'danger'}
          >
            <TagInput
              addOnBlur={true}
              addOnPaste={true}
              placeholder="Укажите контекст"
              intent={validContext ? 'none' : 'danger'}
              onChange={handleChangeContext}
              values={contexts}
            />
          </FormGroup>

          <FormGroup label="Процент точности">
            <Slider
              min={0}
              max={100}
              stepSize={1}
              labelStepSize={10}
              value={precision}
              onChange={handleChangePrecision}
            />
          </FormGroup>

          <FormGroup label="Состояние" labelFor="add-qnq-category-switch">
            <Switch
              id="add-qnq-category-switch"
              label={enabled ? 'Включена' : 'Отключена'}
              onChange={handleChangeStatus}
              checked={enabled}
            />
          </FormGroup>
          <p>* - обязательные поля</p>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={handleSubmitForm}>Добавить</Button>
            <Button onClick={handleClose}>Закрыть</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default AddCategoryModal
