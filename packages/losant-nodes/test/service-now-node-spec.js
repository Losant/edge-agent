import { nock } from './common.js';
import ServiceNowNode from '../src/service-now-node.js';

describe('ServiceNowNode', () => {
  it('should get a list of incidents', async () => {
    nock('https://example.service-now.com:443', { encodedQueryParams: true })
      .get('/api/now/v2/table/incident')
      .query({ sysparm_limit: '1', sysparm_suppress_pagination_header: 'true' })
      .reply(200, {
        result: [{
          parent: '', made_sla: 'false', caused_by: '', watch_list: '', upon_reject: '', sys_updated_on: '2018-06-11 19:02:24', child_incidents: '', hold_reason: '', approval_history: '', skills: '', number: 'INC0000001', resolved_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/6816f79cc0a8016401c5a33be04be441', value: '6816f79cc0a8016401c5a33be04be441' }, sys_updated_by: 'admin', opened_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/681ccaf9c0a8016400b98a06818d57c7', value: '681ccaf9c0a8016400b98a06818d57c7' }, user_input: '', sys_created_on: '2016-06-30 18:24:13', sys_domain: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/global', value: 'global' }, state: '7', sys_created_by: 'pat', knowledge: 'false', order: '', calendar_stc: '7937181', closed_at: '2017-11-30 23:10:06', cmdb_ci: { link: 'https://example.service-now.com/api/now/v2/table/cmdb_ci/b0c4030ac0a800090152e7a4564ca36c', value: 'b0c4030ac0a800090152e7a4564ca36c' }, delivery_plan: '', contract: '', impact: '1', active: 'false', work_notes_list: '', business_service: '', priority: '1', sys_domain_path: '/', rfc: '', time_worked: '', expected_start: '', opened_at: '2017-11-29 23:09:51', business_duration: '1970-01-22 21:46:21', group_list: '', work_end: '', caller_id: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/5137153cc611227c000bbd1bd8cd2005', value: '5137153cc611227c000bbd1bd8cd2005' }, reopened_time: '', resolved_at: '2018-03-01 19:56:12', approval_set: '', subcategory: '', work_notes: '', short_description: "Can't read email", close_code: 'Closed/Resolved by Caller', correlation_display: '', delivery_task: '', work_start: '', assignment_group: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/d625dccec0a8016700a222a0f7900d06', value: 'd625dccec0a8016700a222a0f7900d06' }, additional_assignee_list: '', business_stc: '1892781', description: 'a description of something that happened', calendar_duration: '1970-04-02 20:46:21', close_notes: 'Closed before close notes were made mandatory\n\t\t', notify: '1', sys_class_name: 'incident', closed_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/9ee1b13dc6112271007f9d0efdb69cd0', value: '9ee1b13dc6112271007f9d0efdb69cd0' }, follow_up: '', parent_incident: '', sys_id: '9c573169c611228700193229fff72400', contact_type: '', reopened_by: '', incident_state: '7', urgency: '1', problem_id: { link: 'https://example.service-now.com/api/now/v2/table/problem/9d3a266ac6112287004e37fb2ceb0133', value: '9d3a266ac6112287004e37fb2ceb0133' }, company: { link: 'https://example.service-now.com/api/now/v2/table/core_company/31bea3d53790200044e0bfc8bcbe5dec', value: '31bea3d53790200044e0bfc8bcbe5dec' }, reassignment_count: '1', activity_due: '', assigned_to: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/46b87022a9fe198101a78787e40d7547', value: '46b87022a9fe198101a78787e40d7547' }, severity: '1', comments: '', approval: '', sla_due: '', comments_and_work_notes: '', due_date: '', sys_mod_count: '26', reopen_count: '', sys_tags: '', escalation: '0', upon_approval: '', correlation_id: '', location: { link: 'https://example.service-now.com/api/now/v2/table/cmn_location/1083361cc611227501b682158cabf646', value: '1083361cc611227501b682158cabf646' }, category: 'network'
        }]
      }, [ 'Set-Cookie',
        'JSESSIONID=FA75C0FF5D17BCD4EB79205E03B64940; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_session=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_route=glide.1dc8773fa40bf1ff4396cd63a3359cf9; Expires=Mon, 08-Jul-2086 19:39:08 GMT; Path=/; HttpOnly;Secure',
        'X-Is-Logged-In',
        'true',
        'X-Transaction-ID',
        'c1f84ff13772',
        'Set-Cookie',
        'glide_session_store=C9F84FF1377213009873DED993990EF3; Expires=Wed, 20-Jun-2018 16:55:01 GMT; Path=/; HttpOnly;Secure',
        'X-Total-Count',
        '67',
        'Pragma',
        'no-store,no-cache',
        'Cache-control',
        'no-cache,no-store,must-revalidate,max-age=-1',
        'Expires',
        '0',
        'Content-Type',
        'application/json;charset=UTF-8',
        'Transfer-Encoding',
        'chunked',
        'Date',
        'Wed, 20 Jun 2018 16:25:01 GMT',
        'Server',
        'ServiceNow',
        'Connection',
        'close',
        'Set-Cookie',
        'BIGipServerpool_example=2558537482.34624.0000; path=/; Httponly; Secure',
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains' ]);
    const config = {
      instanceNameTemplate: 'example',
      usernameTemplate: 'admin',
      passwordTemplate: 'Test1234!',
      tableNameTemplate: 'incident',
      action: 'table_get',
      idTemplate: null,
      params: [
        {
          name: 'sysparmLimit',
          type: 'string',
          value: 1
        },
        {
          name: 'sysparmSuppressPaginationHeader',
          type: 'string',
          value: true
        }
      ],
      resultPath: 'res'
    };
    const node = new ServiceNowNode('id', [[4]], config);
    const result = await node.run({}, {});
    result[1].res.result.length.should.equal(1);
  });
  it('should get a single incident row', async () => {
    nock('https://example.service-now.com:443', { encodedQueryParams: true })
      .get('/api/now/v2/table/incident/9c573169c611228700193229fff72400')
      .reply(200, {
        result: {
          parent: '', made_sla: 'false', caused_by: '', watch_list: '', upon_reject: '', sys_updated_on: '2018-06-11 18:47:14', child_incidents: '', hold_reason: '', approval_history: '', number: 'INC0000001', resolved_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/6816f79cc0a8016401c5a33be04be441', value: '6816f79cc0a8016401c5a33be04be441' }, sys_updated_by: 'admin', opened_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/681ccaf9c0a8016400b98a06818d57c7', value: '681ccaf9c0a8016400b98a06818d57c7' }, user_input: '', sys_created_on: '2016-06-30 18:24:13', sys_domain: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/global', value: 'global' }, state: '7', sys_created_by: 'pat', knowledge: 'false', order: '', calendar_stc: '7937181', closed_at: '2017-11-30 23:10:06', cmdb_ci: { link: 'https://example.service-now.com/api/now/v2/table/cmdb_ci/b0c4030ac0a800090152e7a4564ca36c', value: 'b0c4030ac0a800090152e7a4564ca36c' }, delivery_plan: '', impact: '1', active: 'false', work_notes_list: '', business_service: '', priority: '1', sys_domain_path: '/', rfc: '', time_worked: '', expected_start: '', opened_at: '2017-11-29 23:09:51', business_duration: '1970-01-22 21:46:21', group_list: '', work_end: '', caller_id: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/5137153cc611227c000bbd1bd8cd2005', value: '5137153cc611227c000bbd1bd8cd2005' }, reopened_time: '', resolved_at: '2018-03-01 19:56:12', approval_set: '', subcategory: '', work_notes: '', short_description: "Can't read email", close_code: 'Closed/Resolved by Caller', correlation_display: '', delivery_task: '', work_start: '', assignment_group: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/d625dccec0a8016700a222a0f7900d06', value: 'd625dccec0a8016700a222a0f7900d06' }, additional_assignee_list: '', business_stc: '1892781', description: 'a description of something that happened', calendar_duration: '1970-04-02 20:46:21', close_notes: 'Closed before close notes were made mandatory\n\t\t', notify: '1', sys_class_name: 'incident', closed_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/9ee1b13dc6112271007f9d0efdb69cd0', value: '9ee1b13dc6112271007f9d0efdb69cd0' }, follow_up: '', parent_incident: '', sys_id: '9c573169c611228700193229fff72400', contact_type: '', reopened_by: '', incident_state: '7', urgency: '1', problem_id: { link: 'https://example.service-now.com/api/now/v2/table/problem/9d3a266ac6112287004e37fb2ceb0133', value: '9d3a266ac6112287004e37fb2ceb0133' }, company: { link: 'https://example.service-now.com/api/now/v2/table/core_company/31bea3d53790200044e0bfc8bcbe5dec', value: '31bea3d53790200044e0bfc8bcbe5dec' }, reassignment_count: '1', activity_due: '', assigned_to: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/46b87022a9fe198101a78787e40d7547', value: '46b87022a9fe198101a78787e40d7547' }, severity: '1', comments: '', approval: '', sla_due: '', comments_and_work_notes: '', due_date: '', sys_mod_count: '25', reopen_count: '', sys_tags: '', escalation: '0', upon_approval: '', correlation_id: '', location: { link: 'https://example.service-now.com/api/now/v2/table/cmn_location/1083361cc611227501b682158cabf646', value: '1083361cc611227501b682158cabf646' }, category: 'network'
        }
      }, [ 'Set-Cookie',
        'JSESSIONID=254D6175508026EDC71C5A16FF029FE7; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_session=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_route=glide.1dc8773fa40bf1ff4396cd63a3359cf9; Expires=Sat, 29-Jun-2086 22:15:05 GMT; Path=/; HttpOnly;Secure',
        'X-Is-Logged-In',
        'true',
        'X-Transaction-ID',
        '3d56914f37a2',
        'Set-Cookie',
        'glide_session_store=3556914F37A213009873DED993990E3E; Expires=Mon, 11-Jun-2018 19:30:58 GMT; Path=/; HttpOnly;Secure',
        'Pragma',
        'no-store,no-cache',
        'Cache-control',
        'no-cache,no-store,must-revalidate,max-age=-1',
        'Expires',
        '0',
        'Content-Type',
        'application/json;charset=UTF-8',
        'Transfer-Encoding',
        'chunked',
        'Date',
        'Mon, 11 Jun 2018 19:00:58 GMT',
        'Server',
        'ServiceNow',
        'Connection',
        'close',
        'Set-Cookie',
        'BIGipServerpool_example=2558537482.34624.0000; path=/; Httponly; Secure',
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains' ]);
    const config = {
      instanceNameTemplate: 'example',
      usernameTemplate: 'admin',
      passwordTemplate: 'Test1234!',
      tableNameTemplate: 'incident',
      action: 'table_row_get',
      idTemplate: '9c573169c611228700193229fff72400',
      resultPath: 'res'
    };
    const node = new ServiceNowNode('id', [[4]], config);
    const result = await node.run({}, {});
    result[1].res.result.should.be.an.Object();
  });

  it('should be able to add a row to an incident table', async () => {
    nock('https://example.service-now.com:443', { encodedQueryParams: true })
      .post('/api/now/v2/table/incident', { active: true, comments: 'a comment', description: 'a description of something that happened' })
      .reply(201, {
        result: {
          parent: '', made_sla: 'true', caused_by: '', watch_list: '', upon_reject: 'cancel', sys_updated_on: '2018-06-11 19:01:39', child_incidents: '0', hold_reason: '', approval_history: '', number: 'INC0010008', resolved_by: '', sys_updated_by: 'admin', opened_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/6816f79cc0a8016401c5a33be04be441', value: '6816f79cc0a8016401c5a33be04be441' }, user_input: '', sys_created_on: '2018-06-11 19:01:39', sys_domain: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/global', value: 'global' }, state: '1', sys_created_by: 'admin', knowledge: 'false', order: '', calendar_stc: '', closed_at: '', cmdb_ci: '', delivery_plan: '', impact: '3', active: 'true', work_notes_list: '', business_service: '', priority: '5', sys_domain_path: '/', rfc: '', time_worked: '', expected_start: '', opened_at: '2018-06-11 19:01:39', business_duration: '', group_list: '', work_end: '', caller_id: '', reopened_time: '', resolved_at: '', approval_set: '', subcategory: '', work_notes: '', short_description: '', close_code: '', correlation_display: '', delivery_task: '', work_start: '', assignment_group: '', additional_assignee_list: '', business_stc: '', description: 'a description of something that happened', calendar_duration: '', close_notes: '', notify: '1', sys_class_name: 'incident', closed_by: '', follow_up: '', parent_incident: '', sys_id: '2f761dcb37a213009873ded993990e21', contact_type: '', reopened_by: '', incident_state: '1', urgency: '3', problem_id: '', company: '', reassignment_count: '0', activity_due: '', assigned_to: '', severity: '3', comments: '', approval: 'not requested', sla_due: '', comments_and_work_notes: '', due_date: '', sys_mod_count: '0', reopen_count: '0', sys_tags: '', escalation: '0', upon_approval: 'proceed', correlation_id: '', location: '', category: 'inquiry'
        }
      }, [ 'Set-Cookie',
        'JSESSIONID=A8251451BD09B3230CAA0C407ECA739A; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_session=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_route=glide.1dc8773fa40bf1ff4396cd63a3359cf9; Expires=Sat, 29-Jun-2086 22:15:46 GMT; Path=/; HttpOnly;Secure',
        'X-Is-Logged-In',
        'true',
        'X-Transaction-ID',
        'e376514f37a2',
        'Set-Cookie',
        'glide_session_store=EB76514F37A213009873DED993990E05; Expires=Mon, 11-Jun-2018 19:31:39 GMT; Path=/; HttpOnly;Secure',
        'Location',
        'https://example.service-now.com/api/now/v2/table/incident/2f761dcb37a213009873ded993990e21',
        'Pragma',
        'no-store,no-cache',
        'Cache-control',
        'no-cache,no-store,must-revalidate,max-age=-1',
        'Expires',
        '0',
        'Content-Type',
        'application/json;charset=UTF-8',
        'Transfer-Encoding',
        'chunked',
        'Date',
        'Mon, 11 Jun 2018 19:01:39 GMT',
        'Server',
        'ServiceNow',
        'Connection',
        'close',
        'Set-Cookie',
        'BIGipServerpool_example=2558537482.34624.0000; path=/; Httponly; Secure',
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains' ]);
    const config = {
      instanceNameTemplate: 'example',
      usernameTemplate: 'admin',
      passwordTemplate: 'Test1234!',
      tableNameTemplate: 'incident',
      action: 'table_post',
      resultPath: 'res',
      bodyTemplate: [
        { key: 'active', valueTemplate: true },
        { key: 'comments', valueTemplate: 'a comment' },
        { key: 'description', valueTemplate: 'a description of something that happened' }
      ]
    };
    const node = new ServiceNowNode('id', [[4]], config);
    const result = await node.run({}, {});
    result[1].res.result.should.be.an.Object();
  });

  it('should be able to update a row to an incident table', async () => {
    nock('https://example.service-now.com:443', { encodedQueryParams: true })
      .put('/api/now/v2/table/incident/9c573169c611228700193229fff72400', { active: true, comments: 'a comment', description: 'a description of something that happened' })
      .reply(200, {
        result: {
          parent: '', made_sla: 'false', caused_by: '', watch_list: '', upon_reject: '', sys_updated_on: '2018-06-11 19:02:24', child_incidents: '', hold_reason: '', approval_history: '', number: 'INC0000001', resolved_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/6816f79cc0a8016401c5a33be04be441', value: '6816f79cc0a8016401c5a33be04be441' }, sys_updated_by: 'admin', opened_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/681ccaf9c0a8016400b98a06818d57c7', value: '681ccaf9c0a8016400b98a06818d57c7' }, user_input: '', sys_created_on: '2016-06-30 18:24:13', sys_domain: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/global', value: 'global' }, state: '7', sys_created_by: 'pat', knowledge: 'false', order: '', calendar_stc: '7937181', closed_at: '2017-11-30 23:10:06', cmdb_ci: { link: 'https://example.service-now.com/api/now/v2/table/cmdb_ci/b0c4030ac0a800090152e7a4564ca36c', value: 'b0c4030ac0a800090152e7a4564ca36c' }, delivery_plan: '', impact: '1', active: 'false', work_notes_list: '', business_service: '', priority: '1', sys_domain_path: '/', rfc: '', time_worked: '', expected_start: '', opened_at: '2017-11-29 23:09:51', business_duration: '1970-01-22 21:46:21', group_list: '', work_end: '', caller_id: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/5137153cc611227c000bbd1bd8cd2005', value: '5137153cc611227c000bbd1bd8cd2005' }, reopened_time: '', resolved_at: '2018-03-01 19:56:12', approval_set: '', subcategory: '', work_notes: '', short_description: "Can't read email", close_code: 'Closed/Resolved by Caller', correlation_display: '', delivery_task: '', work_start: '', assignment_group: { link: 'https://example.service-now.com/api/now/v2/table/sys_user_group/d625dccec0a8016700a222a0f7900d06', value: 'd625dccec0a8016700a222a0f7900d06' }, additional_assignee_list: '', business_stc: '1892781', description: 'a description of something that happened', calendar_duration: '1970-04-02 20:46:21', close_notes: 'Closed before close notes were made mandatory\n\t\t', notify: '1', sys_class_name: 'incident', closed_by: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/9ee1b13dc6112271007f9d0efdb69cd0', value: '9ee1b13dc6112271007f9d0efdb69cd0' }, follow_up: '', parent_incident: '', sys_id: '9c573169c611228700193229fff72400', contact_type: '', reopened_by: '', incident_state: '7', urgency: '1', problem_id: { link: 'https://example.service-now.com/api/now/v2/table/problem/9d3a266ac6112287004e37fb2ceb0133', value: '9d3a266ac6112287004e37fb2ceb0133' }, company: { link: 'https://example.service-now.com/api/now/v2/table/core_company/31bea3d53790200044e0bfc8bcbe5dec', value: '31bea3d53790200044e0bfc8bcbe5dec' }, reassignment_count: '1', activity_due: '', assigned_to: { link: 'https://example.service-now.com/api/now/v2/table/sys_user/46b87022a9fe198101a78787e40d7547', value: '46b87022a9fe198101a78787e40d7547' }, severity: '1', comments: '', approval: '', sla_due: '', comments_and_work_notes: '', due_date: '', sys_mod_count: '26', reopen_count: '', sys_tags: '', escalation: '0', upon_approval: '', correlation_id: '', location: { link: 'https://example.service-now.com/api/now/v2/table/cmn_location/1083361cc611227501b682158cabf646', value: '1083361cc611227501b682158cabf646' }, category: 'network'
        }
      }, [ 'Set-Cookie',
        'JSESSIONID=C47B3161D114B237947C1E25D8BBD4E7; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_session=""; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Path=/; HttpOnly;Secure',
        'Set-Cookie',
        'glide_user_route=glide.1dc8773fa40bf1ff4396cd63a3359cf9; Expires=Sat, 29-Jun-2086 22:16:31 GMT; Path=/; HttpOnly;Secure',
        'X-Is-Logged-In',
        'true',
        'X-Transaction-ID',
        'b2a6d14f37a2',
        'Set-Cookie',
        'glide_session_store=BAA6D14F37A213009873DED993990EF2; Expires=Mon, 11-Jun-2018 19:32:24 GMT; Path=/; HttpOnly;Secure',
        'Pragma',
        'no-store,no-cache',
        'Cache-control',
        'no-cache,no-store,must-revalidate,max-age=-1',
        'Expires',
        '0',
        'Content-Type',
        'application/json;charset=UTF-8',
        'Transfer-Encoding',
        'chunked',
        'Date',
        'Mon, 11 Jun 2018 19:02:24 GMT',
        'Server',
        'ServiceNow',
        'Connection',
        'close',
        'Set-Cookie',
        'BIGipServerpool_example=2558537482.34624.0000; path=/; Httponly; Secure',
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains' ]);
    const config = {
      instanceNameTemplate: 'example',
      usernameTemplate: 'admin',
      passwordTemplate: 'Test1234!',
      tableNameTemplate: 'incident',
      action: 'table_row_put',
      resultPath: 'res',
      idTemplate: '9c573169c611228700193229fff72400',
      bodyTemplate: { active: true, comments: 'a comment', description: 'a description of something that happened' },
      bodyTemplateType: 'jsonTemplate'
    };
    const node = new ServiceNowNode('id', [[4]], config);
    const result = await node.run({}, {});
    result[1].res.result.should.be.an.Object();
  });
  it('should be able to set an error on a payload', async () => {
    nock('https://example.service-now.com:443', { encodedQueryParams: true })
      .put('/api/now/v2/table/incident/9c573169c611228700193229fff72400', { active: true, comments: 'a comment', description: 'a description of something that happened' })
      .reply(401, { error: { message: 'User Not Authenticated', detail: 'Required to provide Auth information' }, status: 'failure' }, [ 'Set-Cookie',
        'JSESSIONID=70D6754CA42C2E7B362B0285CDB3A567; Path=/; HttpOnly;Secure',
        'WWW-Authenticate',
        'BASIC realm="Service-now"',
        'Pragma',
        'no-store,no-cache',
        'Cache-control',
        'no-cache,no-store,must-revalidate,max-age=-1',
        'Expires',
        '0',
        'Content-Type',
        'application/json;charset=UTF-8',
        'Transfer-Encoding',
        'chunked',
        'Date',
        'Mon, 18 Jun 2018 19:43:02 GMT',
        'Server',
        'ServiceNow',
        'Set-Cookie',
        'BIGipServerpool_example=2558537482.34624.0000; path=/; Httponly; Secure',
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains',
        'Connection',
        'close' ]);
    const config = {
      instanceNameTemplate: 'example',
      usernameTemplate: 'admin',
      passwordTemplate: 'Test1234',
      tableNameTemplate: 'incident',
      action: 'table_row_put',
      resultPath: 'res',
      idTemplate: '9c573169c611228700193229fff72400',
      bodyTemplate: { active: true, comments: 'a comment', description: 'a description of something that happened' },
      bodyTemplateType: 'jsonTemplate'
    };
    const node = new ServiceNowNode('id', [[4]], config);
    const result = await node.run({}, {});
    result[1].res.error.should.be.an.Object();
    result[1].res.error.statusCode.should.equal(401);
  });

  describe('errors', () => {
    it('should throw an error if both url and instanceNameTemplate are empty', () => {
      const node = new ServiceNowNode('id', [[4]], {});
      return node.run({}, {}).should.be.rejectedWith({
        message: 'Missing ServiceNow Url or Instance Name'
      });
    });
    it('should throw an error on a bad instance name', () => {
      const node = new ServiceNowNode('id', [[4]], { instanceNameTemplate: 'dev#62777' });
      return node.run({}, { }).should.be.rejectedWith({
        message: 'Instance name is invalid: dev#62777'
      });
    });
    it('should throw an error if usernameTemplate is missing', () => {
      const config = {
        instanceNameTemplate: 'example'
      };
      const node = new ServiceNowNode('id', [[4]], config);
      return node.run({}, {}).should.be.rejectedWith({
        message: 'Missing ServiceNow Username'
      });
    });
    it('should throw an error if passwordTemplate is missing', () => {
      const config = {
        instanceNameTemplate: 'example',
        usernameTemplate: 'admin'
      };
      const node = new ServiceNowNode('id', [[4]], config);
      return node.run({}, {}).should.be.rejectedWith({
        message: 'Missing ServiceNow Password'
      });
    });
    it('should throw an error if tableNameTemplate is not given', () => {
      const config = {
        instanceNameTemplate: 'example',
        usernameTemplate: 'admin',
        passwordTemplate: 'pass'
      };
      const node = new ServiceNowNode('id', [[4]], config);
      return node.run({}, {}).should.be.rejectedWith({
        message: 'Missing ServiceNow Table Name'
      });
    });
    it('should throw an error if id is required for the call and not given', () => {
      const config = {
        instanceNameTemplate: 'example',
        usernameTemplate: 'admin',
        passwordTemplate: 'pass',
        action: 'table_row_get',
        tableNameTemplate: 'incident'
      };
      const node = new ServiceNowNode('id', [[4]], config);
      return node.run({}, {}).should.be.rejectedWith({
        message: 'Missing ServiceNow ID'
      });
    });
  });
});

