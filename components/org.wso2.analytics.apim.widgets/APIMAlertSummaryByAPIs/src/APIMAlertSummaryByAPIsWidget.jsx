/*
 *  Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 *
 */

import React from 'react';
import {
    defineMessages, IntlProvider, FormattedMessage, addLocaleData,
} from 'react-intl';
import Axios from 'axios';
import cloneDeep from 'lodash/cloneDeep';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Widget from '@wso2-dashboards/widget';
import APIMAlertSummaryByAPIs from './APIMAlertSummaryByAPIs';

const darkTheme = createMuiTheme({
    palette: {
        type: 'dark',
    },
    typography: {
        useNextVariants: true,
    },
});

const lightTheme = createMuiTheme({
    palette: {
        type: 'light',
    },
    typography: {
        useNextVariants: true,
    },
});

/**
 * Query string parameter
 * @type {string}
 */
const queryParamKey = 'throttledapis';

/**
 * Language
 * @type {string}
 */
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage;

/**
 * Language without region code
 */
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0];

/**
 * Create React Component for APIM Top Throttled Out Apis
 * @class APIMAlertSummaryByAPIsWidget
 * @extends {Widget}
 */
class APIMAlertSummaryByAPIsWidget extends Widget {
    /**
     * Creates an instance of APIMAlertSummaryByAPIsWidget.
     * @param {any} props @inheritDoc
     * @memberof APIMAlertSummaryByAPIsWidget
     */
    constructor(props) {
        super(props);

        this.styles = {
            paper: {
                padding: '5%',
                border: '2px solid #4555BB',
            },
            paperWrapper: {
                margin: 'auto',
                width: '50%',
                marginTop: '20%',
            },
        };

        this.state = {
            width: this.props.width,
            height: this.props.height,
            throttledData: null,
            legendData: null,
            limit: 5,
            localeMessages: null,
            inProgress: true,
        };

        // This will re-size the widget when the glContainer's width is changed.
        if (this.props.glContainer !== undefined) {
            this.props.glContainer.on('resize', () => this.setState({
                width: this.props.glContainer.width,
                height: this.props.glContainer.height,
            }));
        }

        this.handlePublisherParameters = this.handlePublisherParameters.bind(this);
        this.assembleQuery = this.assembleQuery.bind(this);
        this.handleDataReceived = this.handleDataReceived.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleOnClickAPI = this.handleOnClickAPI.bind(this);
    }

    componentWillMount() {
        const locale = (languageWithoutRegionCode || language || 'en');
        this.loadLocale(locale).catch(() => {
            this.loadLocale().catch(() => {
                // TODO: Show error message.
            });
        });
    }

    componentDidMount() {
        const { widgetID } = this.props;
        this.loadLimit();

        super.getWidgetConfiguration(widgetID)
            .then((message) => {
                this.setState({
                    providerConfig: message.data.configs.providerConfig,
                }, () => super.subscribe(this.handlePublisherParameters));
            })
            .catch((error) => {
                console.error("Error occurred when loading widget '" + widgetID + "'. " + error);
                this.setState({
                    faultyProviderConfig: true,
                });
            });
    }

    componentWillUnmount() {
        const { id } = this.props;
        super.getWidgetChannelManager().unsubscribeWidget(id);
    }

    /**
     * Load locale file.
     * @param {string} locale Locale name
     * @memberof APIMAlertSummaryByAPIsWidget
     */
    loadLocale(locale = 'en') {
        return new Promise((resolve, reject) => {
            Axios
                .get(`${window.contextPath}/public/extensions/widgets/APIMAlertSummaryByAPIs/locales/${locale}.json`)
                .then((response) => {
                    // eslint-disable-next-line global-require, import/no-dynamic-require
                    addLocaleData(require(`react-intl/locale-data/${locale}`));
                    this.setState({ localeMessages: defineMessages(response.data) });
                    resolve();
                })
                .catch(error => reject(error));
        });
    }

    /**
     * Retrieve the limit from query param
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    loadLimit() {
        let { limit } = super.getGlobalState(queryParamKey);
        if (!limit || limit < 0) {
            limit = 5;
        }
        this.setQueryParam(limit);
        this.setState({ limit });
    }

    /**
     * Retrieve params from publisher - DateTimeRange
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    handlePublisherParameters(receivedMsg) {
        const queryParam = super.getGlobalState('dtrp');
        const { sync } = queryParam;
        const { from, to, granularity } = receivedMsg;

        if (from) {
            this.setState({
                timeFrom: from,
                timeTo: to,
                perValue: granularity,
                inProgress: !sync,
            }, this.assembleQuery);
        }
    }

    /**
     * Formats the siddhi query using selected options
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    assembleQuery() {
        const {
            providerConfig, timeFrom, timeTo, perValue, limit,
        } = this.state;
        const { id, widgetID: widgetName } = this.props;

        if (timeFrom) {
            if (limit > 0) {
                const dataProviderConfigs = cloneDeep(providerConfig);
                dataProviderConfigs.configs.config.queryData.queryName = 'query';
                dataProviderConfigs.configs.config.queryData.queryValues = {
                    '{{from}}': timeFrom,
                    '{{to}}': timeTo,
                    '{{per}}': perValue,
                    '{{limit}}': limit,
                };
                super.getWidgetChannelManager()
                    .subscribeWidget(id, widgetName, this.handleDataReceived, dataProviderConfigs);
            } else {
                this.setState({ inProgress: false, throttledData: [] });
            }
        }
    }

    /**
     * Formats data retrieved and loads to the widget
     * @param {object} message - data retrieved
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    handleDataReceived(message) {
        const { limit } = this.state;
        const { data, metadata: { names } } = message;

        if (data && data.length > 0) {
            const legendData = [];
            const newData = data.map((row) => {
                const obj = {};
                for (let j = 0; j < row.length; j++) {
                    obj[names[j]] = row[j];
                    if (j === 0 && !legendData.includes({ name: row[j] })) {
                        legendData.push({ name: row[j] });
                    }
                }
                return obj;
            });
            this.setState({ legendData, throttledData: newData, inProgress: false });
            this.setQueryParam(limit);
        } else {
            this.setState({ inProgress: false, throttledData: [] });
        }
    }

    /**
     * Updates query param values
     * @param {number} limit - data limitation value
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    setQueryParam(limit) {
        super.setGlobalState(queryParamKey, { limit });
    }

    /**
     * Handle Select Change
     * @param {Event} event - listened event
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    handleChange(event) {
        const limit = (event.target.value).replace('-', '').split('.')[0];

        this.setQueryParam(parseInt(limit, 10));
        if (limit) {
            this.setState({ inProgress: true, limit }, this.assembleQuery);
        } else {
            this.setState({ limit });
        }
    }

    /**
     * Handle onClick of an API and drill down
     * @memberof APIMAlertSummaryByAPIsWidget
     * */
    handleOnClickAPI(data) {
        const { configs } = this.props;

        if (configs && configs.options) {
            const { drillDown } = configs.options;

            if (drillDown) {
                const {
                    tr, sd, ed, g,
                } = super.getGlobalState('dtrp');
                const { apiname, apiversion } = data;
                const api = (apiname.split(' (')[0]).trim();
                const provider = (apiname.split('(')[1]).split(')')[0].trim();
                const locationParts = window.location.pathname.split('/');
                const dashboard = locationParts[locationParts.length - 2];

                window.location.href = window.contextPath
                    + '/dashboards/' + dashboard + '/' + drillDown + '#{"dtrp":{"tr":"' + tr + '","sd":"' + sd
                    + '","ed":"' + ed + '","g":"' + g + '"},"dmSelc":{"dm":"api","op":[{"name":"'
                    + api + '","version":"' + apiversion + '","provider":"' + provider + '"}]}}';
            }
        }
    }

    /**
     * @inheritDoc
     * @returns {ReactElement} Render the APIM Top Throttled Out Apis widget
     * @memberof APIMAlertSummaryByAPIsWidget
     */
    render() {
        const {
            localeMessages, faultyProviderConfig, height, limit, throttledData, legendData, inProgress, width,
        } = this.state;
        const {
            paper, paperWrapper,
        } = this.styles;
        const { muiTheme } = this.props;
        const themeName = muiTheme.name;
        const throttledApisProps = {
            themeName, height, limit, throttledData, legendData, inProgress, width,
        };

        return (
            <IntlProvider locale={language} messages={localeMessages}>
                {
                    faultyProviderConfig ? (
                        <MuiThemeProvider theme={themeName === 'dark' ? darkTheme : lightTheme}>
                            <div style={paperWrapper}>
                                <Paper elevation={1} style={paper}>
                                    <Typography variant='h5' component='h3'>
                                        <FormattedMessage
                                            id='config.error.heading'
                                            defaultMessage='Configuration Error !'
                                        />
                                    </Typography>
                                    <Typography component='p'>
                                        <FormattedMessage
                                            id='config.error.body'
                                            defaultMessage={'Cannot fetch provider configuration for APIM '
                                            + 'Top Throttled Out Apis widget'}
                                        />
                                    </Typography>
                                </Paper>
                            </div>
                        </MuiThemeProvider>
                    ) : (
                        <APIMAlertSummaryByAPIs
                            {...throttledApisProps}
                            handleChange={this.handleChange}
                            handleOnClickAPI={this.handleOnClickAPI}
                        />
                    )
                }
            </IntlProvider>
        );
    }
}

global.dashboard.registerWidget('APIMAlertSummaryByAPIs', APIMAlertSummaryByAPIsWidget);