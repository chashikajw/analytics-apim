/*
 * Copyright (c) 2020, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
package org.wso2.analytics.apim.rest.api.report.reportgen;

import com.google.common.io.Resources;
import io.siddhi.core.SiddhiAppRuntime;
import io.siddhi.core.SiddhiManager;
import io.siddhi.core.event.Event;
import io.siddhi.query.api.definition.Attribute;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.pdfbox.exceptions.COSVisitorException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.edit.PDPageContentStream;
import org.wso2.analytics.apim.rest.api.report.api.ReportGenerator;
import org.wso2.analytics.apim.rest.api.report.reportgen.model.ModelApiResponse;
import org.wso2.analytics.apim.rest.api.report.reportgen.model.Record;
import org.wso2.analytics.apim.rest.api.report.reportgen.model.RowEntry;
import org.wso2.analytics.apim.rest.api.report.reportgen.model.TableData;
import org.wso2.analytics.apim.rest.api.report.reportgen.util.ReportGeneratorUtil;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * This class is responsible for generating the PDF report
 */
public class DefaultReportGeneratorImpl implements ReportGenerator {

    private static final Log log = LogFactory.getLog(DefaultReportGeneratorImpl.class);
    private static final String REQUEST_SUMMARY_MONTHLY_APP_NAME = "APIMTopAppUsersReport.siddhi";

    private List<Integer> recordsPerPageList;
    private TableData table;
    private PDDocument document;
    private Map<Integer, PDPage> pageMap = new HashMap<>();
    private String period;
    private int numOfPages;
    private final String[] months = {"January", "February", "March", "April", "May", "June", "July", "August",
            "September", "October", "November", "December"};

    /**
     * The default implementation of Monthly request report.
     * @param year year of the report.
     * @param month month of the report.
     * @param tenantDomain
     */
    public DefaultReportGeneratorImpl(String year, String month, String tenantDomain) throws IOException {

        this.table = getRecordsFromAggregations(year, month, tenantDomain);
        String[] columnHeaders = {"#", "API Name", "Version", "Application Name", "Application Owner",
                "Request Count"};
        table.setColumnHeaders(columnHeaders);
        String monthName = months[Integer.parseInt(month) - 1];
        this.period = monthName + " " + year;
        this.numOfPages = ReportGeneratorUtil.getNumberOfPages(table.getRows().size());
        this.document = initializePages();
        this.recordsPerPageList = ReportGeneratorUtil.getRecordsPerPage(table.getRows().size());
    }

    private PDDocument initializePages() {

        PDDocument document = new PDDocument();
        for (int i = 1; i <= numOfPages; i++) {
            PDPage nextPage = new PDPage();
            nextPage.setMediaBox(PDPage.PAGE_SIZE_A4);
            nextPage.setRotation(0);
            document.addPage(nextPage);
            pageMap.put(i, nextPage);
        }
        return document;
    }

    /**
     * @return
     * @throws IOException
     * @throws COSVisitorException
     */
    public InputStream generateMonthlyRequestSummaryPDF() throws IOException,
            COSVisitorException {

        if (table.getRows().size() == 0) {
            return null;
        }

        log.debug("Starting to generate PDF.");
        PDPageContentStream contentStream = new PDPageContentStream(document, pageMap.get(1), true, false);

        ReportGeneratorUtil.insertLogo(document, contentStream);
        ReportGeneratorUtil.insertPageNumber(contentStream, 1);
        ReportGeneratorUtil.insertReportTitleToHeader(contentStream, "API Request Summary");
        ReportGeneratorUtil.insertReportTimePeriodToHeader(contentStream, period);
        ReportGeneratorUtil.insertReportGeneratedTimeToHeader(contentStream);
        contentStream.close();

        float[] columnWidths = {40, 110, 50, 110, 110, 110};
        ReportGeneratorUtil.drawTableGrid(document, pageMap, recordsPerPageList, columnWidths, table.getRows().size());
        ReportGeneratorUtil.writeRowsContent(table.getColumnHeaders(), columnWidths, document, pageMap,
                table.getRows());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        document.close();
        log.debug("PDF generation complete.");
        return new ByteArrayInputStream(out.toByteArray());
    }

    private TableData getRecordsFromAggregations(String year, String month, String apiCreatorTenantDomain)
            throws IOException {

        URL url = Resources.getResource(REQUEST_SUMMARY_MONTHLY_APP_NAME);
        String siddhiApp = Resources.toString(url, StandardCharsets.UTF_8);

        TableData table = new TableData();
        String date = year + "-" + month;
        SiddhiManager siddhiManager = new SiddhiManager();
        SiddhiAppRuntime siddhiAppRuntime = siddhiManager.createSiddhiAppRuntime(siddhiApp);
        siddhiAppRuntime.start();

        String requestCountQuery = "from ApiUserPerAppAgg on apiCreatorTenantDomain==" + "\'" +
                apiCreatorTenantDomain +
                "\'" + " within '" + date + "-** **:**:**' per \"months\" select apiName, apiVersion, " +
                "applicationName, applicationOwner, sum(totalRequestCount) as " +
                "RequestCount group by " +
                "apiName, apiVersion, applicationName, applicationOwner order by RequestCount desc";
        Event[] events = siddhiAppRuntime.query(requestCountQuery);
        List<Record> records = ReportGeneratorUtil.getRecords(events);
        ModelApiResponse response = new ModelApiResponse();
        response.setRecords(records);
        Attribute[] attributes = siddhiAppRuntime.getOnDemandQueryOutputAttributes(requestCountQuery);
        response.setDetails(ReportGeneratorUtil.getRecordDetails(attributes));

        if (response != null) {
            List<RowEntry> rowData = new ArrayList<RowEntry>();
            //build data object to pass for generation
            int recordNumber = 1;
            for (Record record : response.getRecords()) {
                RowEntry entry = new RowEntry();
                entry.setEntry(recordNumber + ")");
                entry.setEntry(record.get(0).toString());
                entry.setEntry(record.get(1).toString());
                entry.setEntry(record.get(2).toString());
                entry.setEntry(record.get(3).toString());
                entry.setEntry(record.get(4).toString());
                rowData.add(entry);
                table.setRows(rowData);
                recordNumber += 1;
            }
        }
        return table;
    }

}
