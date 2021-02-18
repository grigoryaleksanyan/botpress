import { Callout, InputGroup } from '@blueprintjs/core'
import { WorkspaceUserWithAttributes } from 'botpress/sdk'
import { lang } from 'botpress/shared'
import { CHAT_USER_ROLE } from 'common/defaults'
import { AuthRole, UserProfile } from 'common/typings'
import _ from 'lodash'
import React, { FC, useState } from 'react'
import { connect } from 'react-redux'
import LoadingSection from '~/Pages/Components/LoadingSection'
import { filterList } from '~/utils/util'

import RoleSection from '../UserList/RoleSection'

const userFilterFields = ['email', 'attributes.firstname', 'attributes.lastname']

interface StateProps {
  profile: UserProfile
  users: WorkspaceUserWithAttributes[]
  loading: boolean
  roles: AuthRole[]
}

interface DispatchProps {}

interface OwnProps {
  onPasswordReset: any
  onUserUpdated: () => void
}

type Props = StateProps & OwnProps

const UserList: FC<Props> = props => {
  const [filter, setFilter] = useState('')

  if (!props.users || props.loading || !props.roles) {
    return <LoadingSection />
  }

  if (!props.users.length) {
    return (
      <Callout
        title={lang.tr('admin.workspace.users.collaborators.noCollaboratorsYet')}
        style={{ textAlign: 'center' }}
      />
    )
  }

  const currentUserEmail = _.get(props.profile, 'email', '').toLowerCase()
  const filteredUsers = filterList<WorkspaceUserWithAttributes>(props.users, userFilterFields, filter)
  const roles = [...props.roles, CHAT_USER_ROLE]

  return (
    <div>
      <InputGroup
        id="input-filter"
        placeholder={lang.tr('admin.workspace.users.collaborators.filterUsers')}
        value={filter}
        onChange={e => setFilter(e.target.value.toLowerCase())}
        autoComplete="off"
        className="filterField"
      />

      <div className="bp_users-container">
        {filter && !filteredUsers.length && (
          <Callout title={lang.tr('admin.workspace.users.collaborators.noMatch')} className="filterCallout" />
        )}

        {roles.map(role => {
          const users = filteredUsers.filter(user => user.role === role.id)
          return users.length ? (
            <RoleSection
              key={role.id}
              users={users}
              role={role}
              currentUserEmail={currentUserEmail}
              onUserUpdated={props.onUserUpdated}
              onPasswordReset={props.onPasswordReset}
            />
          ) : null
        })}
      </div>
    </div>
  )
}

const mapStateToProps = state => ({
  profile: state.user.profile,
  roles: state.roles.roles,
  users: state.user.users,
  loading: state.user.loadingUsers
})

export default connect<StateProps, DispatchProps, OwnProps>(mapStateToProps, {})(UserList)
