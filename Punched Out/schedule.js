function Schedule(apiBaseUrl, accessToken, firstDayOfWeek, editPtoUrl, editPtoRequestUrl, employeeId, source) {
    //console.log('source', source);
    var scheduleService = new ScheduleService(apiBaseUrl, accessToken);
    var notificationService = new NotificationService();
    var eventTypeEnum = Object.freeze({ "PTO": 1, "Shift": 2 });
    var editShiftDynamicTable = new DynamicTable('#editShiftModal #startEndBreaksTable', '#editShiftModal .add-row-button', '.delete-button', initControls);

    function toLowerCaseKeys(obj) {
        return Object.keys(obj).reduce(function (accum, key) {
            accum[key.toLowerCase()] = obj[key];
            return accum;
        }, {});
    }

    var defaultResources = [
        {
            Id: 0,
            FullName: "Open Shifts",
            profileminiimageurl:""
        }
    ];

    var sources = {
        pto: function (start, end, timezone, callback) {
            var ptoTypeIds = $('#pto-select').val();
            var employeeIds = [];
            scheduleService.GetEvents(start, end, timezone, employeeIds, ptoTypeIds)
                .done(function (events) {
                    callback(events.map(function (pto) {
                        //console.log(value);
                        var key = toLowerCaseKeys(pto);
                        key.id = "pto|" + key.id;
                        key.resourceId = key.staffid;
                        key.end = key.start;
                        key.title = key.code + " - " + key.hours;
                        key.eventTypeId = eventTypeEnum.PTO;
                        key.published = true;
                        console.log('PTO: ' + JSON.stringify(key));
                        key.editable = false;
                        return key;
                    }));
                }).fail(function () {
                    callback([]);
                });
        },
        schedule: function (start, end, timezone, callback) {
            var locationIds = $('#location-select').val();
            var jobCodeIds = $('#department-select').val();
            var positionIds = $('#position-select').val();
            var employeeIds = $('#employee-select').val();

            scheduleService.GetSchedule(start, end, timezone, locationIds, jobCodeIds, positionIds, employeeIds)
                .done(function (events) {
                    console.log("get schedule done");
                    
                    callback(events.Shifts.map(function (shift) {
                        //console.log(value);
                        var key = toLowerCaseKeys(shift);

                        // color is an event property
                        key.color = undefined;

                        key.resourceId = key.staffid + 0;
                        if (key.resourceId === 0) {
                            key.staffname = 'Open Shifts';
                        }
                        key.start = key.startdatetime;
                        key.end = key.enddatetime;
                        var startTimeDisplay = moment(key.start).format("h:mm A");
                        var endTimeDisplay = moment(key.end).format("h:mm A");
                        if (moment(key.start).minute() === 0) {
                            startTimeDisplay = moment(key.start).format("hA");
                        }
                        if (moment(key.end).minute() === 0) {
                            endTimeDisplay = moment(key.end).format("hA");
                        }
                        key.title = startTimeDisplay + " - " + endTimeDisplay;
                        key.eventTypeId = eventTypeEnum.Shift;                       
                        console.log("Shift: " + JSON.stringify(key));
                        return key;
                    }));
                }).fail(function () {
                    console.log("get schedule fail");
                    callback([]);
                });
        }

    };

    function exportCSV() {
        var start = $('#schedule_calendar').fullCalendar('getView').start;
        var end = $('#schedule_calendar').fullCalendar('getView').end;
        var employeeIds = $('#employee-select').val();
        var statusIds = $('#status-select').val();

        //console.log($('#schedule_calendar').fullCalendar('getView'));

        scheduleService.ExportEvents(start, end, null, employeeIds, statusIds);
    }

    //This will sort your array
    function SortByName(a, b) {
        var aName = a.LastName.toLowerCase() + a.FirstName.toLowerCase();
        var bName = b.LastName.toLowerCase() + a.FirstName.toLowerCase();
        return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
    }

    this.Init = function (defaultView, startDate, selectedEmployeeId, punchApprovalStatusId) {
        setUpShiftButtons();

        $('#location-select').on('hidden.bs.select', function (e) {
            $('#schedule_calendar').fullCalendar('refetchEvents');
        });
        $('#department-select').on('hidden.bs.select', function (e) {
            $('#schedule_calendar').fullCalendar('refetchEvents');
        });
        $('#position-select').on('hidden.bs.select', function (e) {
            $('#schedule_calendar').fullCalendar('refetchEvents');
        });
        $('#pto-select').on('hidden.bs.select', function (e) {
            $('#schedule_calendar').fullCalendar('refetchEvents');
        });
        $('#employee-select').on('hidden.bs.select', function (e) {
            $('#schedule_calendar').fullCalendar('refetchEvents');
            $('#schedule_calendar').fullCalendar('refetchResources');
        });

        $('#export-calendar').click(exportCSV);        

        if (window.location.hash)
            defaultView = window.location.hash.replace('#', '');

        $('#schedule_calendar').fullCalendar({            
            firstDay: firstDayOfWeek,
            editable: true,
            eventDrop: function (event, delta, revertFunc) {

                var shift = mapEventToShiftDto(event);
                scheduleService.UpdateShift(event.id, shift).done(function (data) {
                    //notificationService.ShowSuccess("Shift Updated");
                }).fail(function () {
                    //alert("UpdateShift failed!");
                    revertFunc();
                }).always(function () {
                    refreshUi();
                });
                //}

            },
            eventResize: function (event, delta, revertFunc) {

                var shift = mapEventToShiftDto(event);
                scheduleService.UpdateShift(event.id, shift).done(function (data) {
                    //notificationService.ShowSuccess("Shift Updated");
                    $('#schedule_calendar').fullCalendar('updateEvent', event);
                }).fail(function () {
                    //alert("UpdateShift failed!");
                    revertFunc();
                }).always(function () {
                    refreshUi();
                });
                //}

            },
            eventAfterAllRender: function(view) {               
                var shifts = $('#schedule_calendar').fullCalendar('clientEvents', function (event) {
                    return event.start >= view.start && event.end <= view.end && event.eventTypeId === eventTypeEnum.Shift;
                });

                var unpublishedShifts = $.grep(shifts,
                    function (el, index) {
                        return (!el.published && el.resourceId != '0');
                    });
                var publishedShifts = $.grep(shifts,
                    function (el, index) {
                        return (el.published && el.resourceId != '0');
                    });
                if (unpublishedShifts.length > 1) {
                    $('#publishShiftsButton').text('Publish ' + unpublishedShifts.length + ' Shifts');
                } else if (unpublishedShifts.length === 1) {
                    $('#publishShiftsButton').text('Publish 1 Shift');
                }

                $('#publishShiftsButton').toggle(unpublishedShifts.length > 0);
                $('#unpublishShiftsButton').toggle(publishedShifts.length > 0);
                $('#clearShiftsButton').toggle(shifts.length > 0);

                $('.resource_totalHours').text("0");
                $('.resource_totalDuration').val("0");
                $.each(shifts, (function (index, shift) {
                    var shiftDuration = moment.duration(shift.duration);
                    var currentTotal = moment.duration($('#resource_' + shift.resourceId + '_totalDuration').val());
                    currentTotal.add(shiftDuration);
                    $('#resource_' + shift.resourceId + '_totalDuration').val(currentTotal.toISOString());
                    $('#resource_' + shift.resourceId + '_totalHours').text((currentTotal.hours() + (currentTotal.minutes() / 60.0)).toFixed(2));
                }));                
                if ($('.fc-time-area .fc-content .fc-rows table tbody tr').eq(0).attr("data-resource-id") == "0") {

                    if ($('.fc-time-area .fc-content .fc-rows table tbody tr').eq(0).find(".fc-timeline-event").hasClass("shift-blue1"))
                        $('.fc-time-area .fc-content .fc-rows table tbody tr').eq(0).find(".fc-timeline-event").addClass("open-shift");
                    //$('.fc-time-area .fc-content .fc-rows table tbody tr').eq(0).find(".fc-timeline-event").append('<div class="fc-description">UK-Construction</div>');
                }

                $("#schedule_calendar .fc-view-container .fc-event .fc-content").append('<span class="fc-hour-count">8hs</span>');
                $(".fc-resource-area .resourceTitle").parent().find(".resourceTotalHour").remove();
                $(".fc-resource-area .resourceTitle").after('<br/><span class="resourceTotalHour" style="font-size:11px;color:#a3a5ad;">Scheduled <span class="scheduled_hrs">0 </span>hrs</span>');
                $(".fc-resource-area .resourceTitle").eq(0).parent().find(".resourceTotalHour").remove();

                $("#schedule_calendar .fc-view-container .fc-event").find("div:nth-child(7)").addClass("position1");

                $("#schedule_calendar .fc-view-container .fc-event").each(function () {

                    //console.log($(this).css("borderColor")+"<br/>");

                    if ($(this).find(".position1").text().length > 0) {
                        if (($(this).find("div:nth-child(5)").text().length > 0) || ($(this).find("div:nth-child(6)").text().length > 0)) {
                            $(this).find("div:nth-child(5)").before('<div class="fc-details">(' + $(this).find("div:nth-child(5)").text() + ',' + $(this).find("div:nth-child(6)").text() + ')</div>');
                            $(this).find("div:nth-child(6)").text("");
                            $(this).find("div:nth-child(7)").text("");
                        }
                        $(this).find(".fc-title").before('<i style="font-size:16px;" class="fa fa-clock-o" aria-hidden="true"></i>');
                        $(this).find(".fa").after('<span class="position" style="margin-left:10px;font-size:12px;font-weight:bold;">' + $(this).find(".position1").text() + '</span>');
                        $(this).find(".fc-title").clone().insertAfter($(this).find(".fc-content"));
                        $(this).find(".fc-title").eq(0).remove();
                        $(this).find(".position1").remove();

                    }

                    if (($(this).find("div:nth-child(5)").text().length > 0)) {
                        $(this).find("div:nth-child(5)").before('<div class="fc-details">(' + $(this).find("div:nth-child(5)").text() + ',' + $(this).find("div:nth-child(6)").text() + ' )</div>');
                        $(this).find("div:nth-child(6)").text("");
                        $(this).find("div:nth-child(7)").text("");
                    }
                    console.log($(this).find(".fc-title").text() + " ");

                });
            },
            selectable: true,
            defaultView: 'timelineWeek',
            views: {
                timelineDay: {
                    slotDuration: '1:00'
                },
                timelineWeek: {
                    slotDuration: '24:00',
                    slotLabelFormat: 'ddd M/D'
                }
            },
            resourceLabelText: 'Employees',
            resourceAreaWidth: '15%',
            //resourceGroupField: 'groupId',

            header: {
                left: 'prev,next today',
                center: 'title',
                right: 'timelineDay, timelineWeek, month'
            },

            displayEventTime: false, // don't show the time column in list view
            dayClick: function (date, jsEvent, view, resource) {
            
                $("#createShiftModal").modal('toggle');
                $('#createShiftModal #StartDateTime').val(moment(date).set('hour', 8).format('MM/DD/Y h:mm A'));
                $('#createShiftModal #EndDateTime').val(moment(date).set('hour', 17).format('MM/DD/Y h:mm A'));
                $('#createShiftModal #StartDate').val(moment(date).format('dddd, MMM D'));
                // clear the options
                $('#createShiftModal #EndDate').find('option').each(function () {
                    $(this).remove(); 
                });
              //add start date and +1 date
                $('#createShiftModal #EndDate').append($('<option>', {
                    value: moment(date).format('MM/DD/Y'),
                    text: moment(date).format('dddd, MMM D')
                }));
                $('#createShiftModal #EndDate').append($('<option>', {
                    value: moment(date).add(1, 'days').format('MM/DD/Y'),
                    text: moment(date).add(1, 'days').format('dddd, MMM D')
                }));
                // refresh bootstrap select
                $('#createShiftModal #EndDate').selectpicker('refresh');
        
                $('#createShiftModal #StartTime').val(moment(date).set('hour', 8).format('h:mm A'));
                $('#createShiftModal #EndTime').val(moment(date).set('hour', 17).format('h:mm A'));
                $('#createShiftModal #StaffIds').selectpicker('val', resource.id);

                //$("#createShiftModal input[name=SelectedDays][value=" + moment(date).day() + "]").prop('checked', true).prop('disabled', true);
                //$('#createShiftModal #SelectedDays').selectpicker('val', moment(date).day());
                //$('#createShiftModal #SelectedDays').find('[value=" + moment(date).day() + "]').prop('disabled', 'disabled');
                $("#createShiftModal #SelectedDays option").each(function () {
                    if ($(this).val() == moment(date).day()) {
                        $(this).prop('disabled', 'disabled');
                    }
                    }
                );
                $('#createShiftModal #SelectedDays').selectpicker('render');
                //window.location = '/Shift/Create?staffId=' + resource.id + '&shiftDate=' + date.format();
            },
            select: function (startDate, endDate, jsEvent, view, resource) {
                //alert('selected ' + startDate.format() + ' to ' + endDate.format() + ' on resource ' + resource.id);
            },
            eventClick: function (calEvent, jsEvent, view) {
                //console.log(calEvent);
                //alert('clicked ' + calEvent.title + ' on resource ' + calEvent.resourceId);
                bindShiftToForm(calEvent);
                $("#editShiftModal").modal('toggle');
                //window.location = '/Shift/Edit/' + calEvent.id;
                //console.log(event.ptotype);
                //return false;
            },

            loading: function (isLoading) {
                //return;
                if (isLoading)
                    bpUIBlock.blockPage();
                else {                    
                    bpUIBlock.unblockPage();
                }
            },
            eventRender: function (event, element, view) {
                //console.log(event);
                if (event.eventTypeId === eventTypeEnum.PTO) {
                    element.css('background-color', '#CCCCCC');
                    element.find('.fc-title').css('color', '#5F5F5F');
                    element.css('color', '#5F5F5F');
                } else {

                    console.log(element);
                    element.css('cursor', 'pointer');
                    if (event.shiftcolorname != undefined) {
                        element.addClass('shift-' + event.shiftcolorname.toLowerCase());
                    } else {
                        event.shiftcolorcode = '#aaa';
                    }
                    if (event.published) {
                        element.css('background-color', event.shiftcolorcode);
                        element.css('color', '#FFF');
                        element.find('.fc-title').css('color', '#FFF');
                        element.css('border-color', event.shiftcolorcode);
                        element.css('border-width', '2px');
                    } else {
                        element.css('border-color', event.shiftcolorcode);
                        element.css('color', event.shiftcolorcode);
                        element.find('.fc-title').css('color', event.shiftcolorcode);
                        element.css('border-width', '2px');
                    }

                    if (view.name === "month") {
                        var staffName = event.staffname;
                        if (staffName === 'Open Shifts') {
                            staffName = 'Open Shift';
                        }
                        var staffLine = $("<div/>").text(staffName);
                        element.append(staffLine);
                    } else {


                        //element.css('background-color', '#FFF');
                        //var timeLine = $("<div/>");
                        var locationLine = $("<div/>").text(event.locationname);
                        element.append(locationLine);
                        var jobCodeLine = $("<div/>").text(event.jobcodename);
                        element.append(jobCodeLine);
                        var positionLine = $("<div/>").text(event.positionname);
                        element.append(positionLine);
                    }

                }
     
                return element;
            },
            eventSources: [
                sources.pto, sources.schedule
            ],
            resources: function (callback) {
                var employeeIds = $('#employee-select').val();

                scheduleService.GetResources(employeeIds)
                    .done(function (resources) {
                        console.log("getting resources done");
                        resources = jQuery.grep(resources, function (n, i) {
                            return (n.IsActive == true);
                        });
                        resources = defaultResources.concat(resources.sort(SortByName));
                        callback(resources.map(function (employee) {
                            //console.log(employee);

                            return {
                                id: employee.Id,
                                title: employee.FullName,
                                profileminiimageurl: employee.ProfileMiniImageUrl
                            };
                        }));
                    }).fail(function (jqXHR, textStatus, errorThrown) {
                        console.log("getting resources fail" + JSON.stringify(jqXHR));
                        callback([]);
                    });
            },
            resourceRender: function (resourceObj, $td) {
                console.log(resourceObj);

                //var newElement = $("<div/>").addClass('fc-widget-content');
                var resourceTable = $('<table>').css("border", "0");
                var resourceRow = $('<tr>');
                var item1 = $("<td>").css("width", "30px").css("border", "0").css("padding", "5px");
                if (resourceObj.profileminiimageurl) {
                    item1.html($('<img class="profile-mini-picture" src="' +
                        resourceObj.profileminiimageurl +
                        '" height="30" width="30" />'));
                }
                var item2 = $("<td>").css("border", "0").css("padding", "5px");
                var titleSpan = $("<span>").append(resourceObj.title).addClass("resourceTitle");
                item2.append(titleSpan);
                
                resourceRow.append(item1);
                resourceRow.append(item2);
                resourceTable.append(resourceRow);
                //newElement.append(stackContainer);
                $td.eq(0).find('.fc-cell-content').html(resourceTable);
                
                //$td.eq(0).find('.fc-cell-content')
                //    .append(
                //        $('<br/>' +
                //        '<input type="hidden" id="resource_' +
                //            resourceObj.id +
                //            '_totalDuration" class="resource_totalDuration" value="0"/>' +
                //            '<strong><span id="resource_' +
                //            resourceObj.id +
                //            '_totalHours" class="resource_totalHours">0</span> hrs</strong>')
                //);
                //if (resourceObj.profileminiimageurl) {
                //    $td.eq(0).find('.fc-cell-content').prepend($('<img class="profile-mini-picture" src="' +
                //        resourceObj.profileminiimageurl +
                //        '" height="30" width="30" />'));
                //}
            },
            viewRender: function (view, element) {
                $("#copyPreviousWeekButton").toggle(view.name === 'timelineWeek');
                //$("#createTemplateButton").toggle(view.name === 'timelineWeek');
                //$("#loadTemplateButton").toggle(view.name === 'timelineWeek');
                //$("#templateDivider").toggle(view.name === 'timelineWeek');
                window.location.hash = view.name;
                if ($(".fc-view").eq(0).has("#totalHoursScheduledLabel").length === 0) {
                    if (view.name === 'timelineWeek') {                    
                        $(".fc-view table").eq(0).append(
                            '<tfoot style="border-top:2px solid black;" class="sticky" ><tr><td style="border-color:transparent;text-align:center;" colspan="3"><table><tbody><tr><td class="fc-axis" style="border:none;text-align:left;font-weight:bold;width:14.5% !important;" >Hours Scheduled</td>' +
                            '<td style="border-color:transparent;padding:5px;color:#ddd;">Non</td>' +
                            '<td style="border-color:transparent;padding:5px;">320hs</td>' +
                            '<td style="border-color:transparent;padding:5px;">320hs</td>' +
                            '<td style="border-color:transparent;padding:5px;">320hs</td>' +
                            '<td style="border-color:transparent;padding:5px;">320hs</td>' +
                            '<td style="border-color:transparent;padding:5px;">320hs</td>' +
                            '<td style="border-color:transparent;padding:5px;color:#ddd;">Non</td>' +
                            '</tr></tbody></table></tr></tfoot>');
                        $(".fc-view table").eq(0).after(
                            '<div style="display:block;height:45px;background:#dfdfdf;padding-top:10px;" class="" ><span style="float:right;margin-right:20px;" id="totalHoursScheduledLabel"><strong>Total Hours Scheduled</strong><span style="margin-left:10px;color:#5198e3;">1600hs</span><br/><span style="color:#A3A5AD;">' +
                            $(".fc-header-toolbar .fc-center h2").text() +
                            '</span></span></div>');
                    } else {
                        $(".fc-view table").eq(0).after(
                            '<div style="display:block;height:45px;background:#dfdfdf;padding-top:10px;" class="" ><span style="float:right;margin-right:20px;" id="totalHoursScheduledLabel"><strong>Total Hours Scheduled</strong><span style="margin-left:10px;color:#5198e3;">1600hs</span><br/><span style="color:#f8f8f8;">' +
                            $(".fc-header-toolbar .fc-center h2").text() +
                            '</span></span></div>');
                    }
                }
            }
        });

        if (startDate) {
            startDate = moment(startDate);
            $('#schedule_calendar').fullCalendar('gotoDate', startDate);
            //$('#schedule_calendar').fullCalendar('select', startDate);
        }

        $('#createShiftModal').on('show.bs.modal',
            function (event) {
                clearCreateShiftForm();
            });
    }

    function setBreaksForSave(modalSelector) {
        // make sure we are posting the correct type of breaks either duration or start/end
        var durationTable = $(modalSelector).find('#durationBreakTable');
        var startEndBreaksPanel = $(modalSelector).find('#startEndBreaksPanel');
        if (durationTable.is(':visible')) {
            //clear any start/end breaks
            $(modalSelector).find("#startEndBreaksTable").find("tr:gt(0)").remove();
            startEndBreaksPanel.find("input").each(function (index, inputElement) {
                $(inputElement).val('');
            });
        } else {
            //clear any duration breaks
            durationTable.find("input").each(function(index, inputElement) {
                $(inputElement).val('');
            });
        }
    }

    function clearCreateShiftForm() {
        console.log("clearCreateShiftForm");
        
        $("#createShiftModal #btnNewShift").addClass('btn-primary').removeClass('btn-secondary');
        $("#createShiftModal #btnOpenShift").addClass('btn-secondary').removeClass('btn-primary');
        $('#createShiftPanel').show();
        $('#openShiftPanel').hide();


        //$("#createShiftModal #btnDurationBreak").addClass('btn-brand').removeClass('btn-secondary');
        //$("#createShiftModal #btnStartEndBreak").addClass('btn-secondary').removeClass('btn-brand');
        $("#createShiftModal #btnDurationBreak").prop('checked', true);
        $("#createShiftModal #btnStartEndBreak").prop('checked', false);
        $('#createShiftModal #durationBreakTable').show();
        $('#createShiftModal #startEndBreaksPanel').hide();

        var durationTable = $('#createShiftModal').find('#durationBreakTable');
        var startEndBreaksPanel = $('#createShiftModal').find('#startEndBreaksPanel');       
        //clear any start/end breaks
        $('#createShiftModal').find("#startEndBreaksTable").find("tr:gt(0)").remove();
        startEndBreaksPanel.find("input").each(function (index, inputElement) {
            $(inputElement).val('');
        });       
        //clear any duration breaks
        durationTable.find("input").each(function (index, inputElement) {
            $(inputElement).val('');
        });        

        //$("#createShiftModal input[name=SelectedDays]").prop('checked', false).prop('disabled', false);
        $("#createShiftModal #SelectedDays option").each(function() {
                $(this).prop('disabled', false);
            }
        );
        $('#createShiftModal .m_selectpicker').selectpicker('deselectAll');
        //$('#createShiftModal .m-radio--state-blue1').click();
        $('#createShiftModal #ShiftColorId').selectpicker('val', '1');
    }

    function bindShiftToForm(event) {
        //var shift = scheduleService.getShiftById(id);
        //$('#editShiftModal #StartDateTime').val(shift.startDateTime); 
        $("#editShiftModal #btnEditShift").addClass('btn-primary').removeClass('btn-secondary');
        $("#editShiftModal #btnCopyShift").addClass('btn-secondary').removeClass('btn-primary');
        $("#editShiftModal #Quantity").val('');
        $('#copyShiftPanel').hide();
        //$('#editShiftPanel').show();

        var durationTable = $('#editShiftModal').find('#durationBreakTable');
        var startEndBreaksPanel = $('#editShiftModal').find('#startEndBreaksPanel');
        //clear any start/end breaks
        $('#editShiftModal').find("#startEndBreaksTable").find("tr:gt(0)").remove();
        startEndBreaksPanel.find("input").each(function (index, inputElement) {
            $(inputElement).val('');
        });
        //clear any duration breaks
        durationTable.find("input").each(function (index, inputElement) {
            $(inputElement).val('');
        });        

        if (event.breaks.length === 0) {
            // no breaks
            //$("#editShiftModal #btnDurationBreak").addClass('btn-brand').removeClass('btn-secondary');
            //$("#editShiftModal #btnStartEndBreak").addClass('btn-secondary').removeClass('btn-brand');
            $("#editShiftModal #btnDurationBreak").prop('checked', true);
            $("#editShiftModal #btnStartEndBreak").prop('checked', false);
            $('#editShiftModal #durationBreakTable').show();
            $('#editShiftModal #startEndBreaksPanel').hide();
        } else if (event.breaks[0].StartTime) {
            // using start/end breaks
            //$("#editShiftModal #btnStartEndBreak").addClass('btn-brand').removeClass('btn-secondary');
            //$("#editShiftModal #btnDurationBreak").addClass('btn-secondary').removeClass('btn-brand');
            $("#editShiftModal #btnStartEndBreak").prop('checked', true);
            $("#editShiftModal #btnDurationBreak").prop('checked', false);
            $('#editShiftModal #startEndBreaksPanel').show();
            $('#editShiftModal #durationBreakTable').hide();
            // there is already 1 row so add additional rows
            for (var i = 0; i < event.breaks.length-1; i++) {
                editShiftDynamicTable.AddNewRow();
            }
            for (var i = 0; i < event.breaks.length; i++) {
                //$("#editShiftModal input[name='Breaks[" + i + "].StartTime']").datetimepicker({
                //    date: moment(event.breaks[0].StartTime)
                //});
                //$("#editShiftModal input[name='Breaks[" + i + "].EndTime']").datetimepicker({
                //    date: moment(event.breaks[0].EndTime)
                //});
                $("#editShiftModal input[name='Breaks[" + i + "].StartTime']").val(moment(event.breaks[i].StartTime).format('h:mm A'));
                $("#editShiftModal input[name='Breaks[" + i + "].EndTime']").val(moment(event.breaks[i].EndTime).format('h:mm A'));
            }
        } else {
            //using duration break
            //$("#editShiftModal #btnDurationBreak").addClass('btn-brand').removeClass('btn-secondary');
            //$("#editShiftModal #btnStartEndBreak").addClass('btn-secondary').removeClass('btn-brand');
            $("#editShiftModal #btnDurationBreak").prop('checked', true);
            $("#editShiftModal #btnStartEndBreak").prop('checked', false);
            $('#editShiftModal #durationBreakTable').show();
            $('#editShiftModal #startEndBreaksPanel').hide();
            $("#editShiftModal input[name='Breaks[0].Duration']").timepicker('setTime', event.breaks[0].Duration);
        }

        $('#editShiftModal .m_selectpicker').selectpicker('deselectAll');
        $('#editShiftModal #Id').val(event.id);
        $('#editShiftModal #Published').val(event.published);
        $('#editShiftModal #StartDateTime').val(moment(event.start).format('MM/DD/Y h:mm A'));
        $('#editShiftModal #EndDateTime').val(moment(event.end).format('MM/DD/Y h:mm A'));

        $('#editShiftModal #StartDate').val(moment(event.start).format('dddd, MMM D'));
        // clear the options
        $('#editShiftModal #EndDate').find('option').each(function () {
            $(this).remove();
        });
        //add start date and +1 date
        $('#editShiftModal #EndDate').append($('<option>', {
            value: moment(event.start).format('MM/DD/Y'),
            text: moment(event.start).format('dddd, MMM D')
        }));
        $('#editShiftModal #EndDate').append($('<option>', {
            value: moment(event.start).add(1, 'days').format('MM/DD/Y'),
            text: moment(event.start).add(1, 'days').format('dddd, MMM D')
        }));
        // refresh bootstrap select
        $('#editShiftModal #EndDate').selectpicker('refresh');
        $('#editShiftModal #EndDate').selectpicker('val', moment(event.end).format('MM/DD/Y'));
        $('#editShiftModal #StartTime').val(moment(event.start).format('h:mm A'));
        $('#editShiftModal #EndTime').val(moment(event.end).format('h:mm A'));
        $('#editShiftModal #StaffId').selectpicker('val', event.resourceId);
        $('#editShiftModal #LocationId').selectpicker('val', event.locationid);
        $('#editShiftModal #JobCodeId').selectpicker('val', event.jobcodeid);
        $('#editShiftModal #PositionId').selectpicker('val', event.positionid);
        //$('#editShiftModal #ShiftColorId').selectpicker('val', event.shiftcolorid);
        //$("#editShiftModal input[name=ShiftColorId][value=" + event.shiftcolorid + "]").prop('checked', true);
        $('#editShiftModal #ShiftColorId').selectpicker('val', event.shiftcolorid);
    
        $("#editShiftModal #SelectedDays option").each(function () {
            if ($(this).val() == moment(event.start).day()) {
                $(this).prop('disabled', 'disabled');
            } else {
                $(this).prop('disabled', false);
            }
            }
        );
        $('#editShiftModal #SelectedDays').selectpicker('render');
        $('#editShiftModal #Notes').val(event.notes);        
    }

    function setUpShiftButtons() {
        $("#createShiftModal #btnNewShift").click(function (event) {
            event.preventDefault();
           
            $("#createShiftModal #btnNewShift").addClass('btn-primary').removeClass('btn-secondary');
            $("#createShiftModal #btnOpenShift").addClass('btn-secondary').removeClass('btn-primary');
            $('#openShiftPanel').hide();
            $('#createShiftPanel').show();
 
        });
        $("#createShiftModal #btnOpenShift").click(function (e) {
            e.preventDefault();
          
            $("#createShiftModal #btnNewShift").addClass('btn-secondary').removeClass('btn-primary');
            $("#createShiftModal #btnOpenShift").addClass('btn-primary').removeClass('btn-secondary');
            $('#createShiftPanel').hide();
            $('#openShiftPanel').show();

            var startDate = moment($("#createShiftModal #StartDateTime").val());
            var dayStart = startDate.clone();
            dayStart = dayStart.hour(0).minute(0);
            var dayEnd = startDate.clone();
            dayEnd = dayEnd.hour(23).minute(59);
            var events = $('#schedule_calendar').fullCalendar('clientEvents', function (event) {
                return event.start >= dayStart && event.end <= dayEnd  && event.eventTypeId === eventTypeEnum.Shift && event.resourceId === '0';
            });
            console.log(events);
        });

        $("#createShiftModal #btnDurationBreak").click(function (event) {
            //event.preventDefault();
            $("#createShiftModal #btnStartEndBreak").prop('checked', false);
            //$("#createShiftModal #btnDurationBreak").addClass('btn-brand').removeClass('btn-secondary');
            //$("#createShiftModal #btnStartEndBreak").addClass('btn-secondary').removeClass('btn-brand');
            $('#createShiftModal #startEndBreaksPanel').hide();
            $('#createShiftModal #durationBreakTable').show();

        });
        $("#createShiftModal #btnStartEndBreak").click(function (e) {
            //e.preventDefault();
            $("#createShiftModal #btnDurationBreak").prop('checked', false);
            //$("#createShiftModal #btnDurationBreak").addClass('btn-secondary').removeClass('btn-brand');
            //$("#createShiftModal #btnStartEndBreak").addClass('btn-brand').removeClass('btn-secondary');
            $('#createShiftModal #durationBreakTable').hide();
            $('#createShiftModal #startEndBreaksPanel').show();            
        });

        var dynamicTable = new DynamicTable('#createShiftModal #startEndBreaksTable', '#createShiftModal .add-row-button', '.delete-button', initControls);
        dynamicTable.Init();

        $("#createShiftModal .btnSave").click(function (event) {
            console.log("btnSave.clicked");
            event.preventDefault();
            var button = event.currentTarget;
            setButtonToWait($(button));
            
            if ($('#createShiftPanel').is(':visible')) {
                $('#createShiftModal #Published').val('False'); 
                setBreaksForSave('#createShiftModal');
                scheduleService.CreateShift($('#createShiftForm').serializeArray()).done(function(data) {
                    $("#createShiftModal").modal('toggle');
                    notificationService.ShowSuccess("Shift Added");
                }).always(function() {
                    setButtonToActive($(button));
                    refreshUi();
                });
            } else {
                $("#createShiftModal").modal('toggle');
                setButtonToActive($(button));
                refreshUi();
            }
        });

        $('#createShiftModal .btnPublish').click(function (event) {
            console.log("btnPublish.clicked");
            event.preventDefault();
            var button = event.currentTarget;
            setButtonToWait($(button));

            if ($('#createShiftPanel').is(':visible')) {
                $('#createShiftModal #Published').val('True');
                setBreaksForSave('#createShiftModal');
                scheduleService.CreateShift($('#createShiftForm').serializeArray()).done(function (data) {
                    $("#createShiftModal").modal('toggle');
                    notificationService.ShowSuccess("Shift Added & Published");
                }).always(function () {
                    setButtonToActive($(button));
                    refreshUi();
                        });
            } else {
                $("#createShiftModal").modal('toggle');
                setButtonToActive($(button));
                refreshUi();
            }
        });

        $("#editShiftModal #btnEditShift").click(function (event) {
            event.preventDefault();

            $("#editShiftModal #btnEditShift").addClass('btn-primary').removeClass('btn-secondary');
            $("#editShiftModal #btnCopyShift").addClass('btn-secondary').removeClass('btn-primary');
            $('#copyShiftPanel').hide();
            //$('#editShiftPanel').show();

        });
        $("#editShiftModal #btnCopyShift").click(function (e) {
            e.preventDefault();

            $("#editShiftModal #btnEditShift").addClass('btn-secondary').removeClass('btn-primary');
            $("#editShiftModal #btnCopyShift").addClass('btn-primary').removeClass('btn-secondary');
            //$('#editShiftPanel').hide();
            $('#copyShiftPanel').show();

        });

    $("#editShiftModal #btnDurationBreak").click(function (event) {
        //event.preventDefault();
        $("#editShiftModal #btnStartEndBreak").prop('checked', false);
        //$("#editShiftModal #btnDurationBreak").addClass('btn-brand').removeClass('btn-secondary');
        //$("#editShiftModal #btnStartEndBreak").addClass('btn-secondary').removeClass('btn-brand');
        $('#editShiftModal #startEndBreaksPanel').hide();
        $('#editShiftModal #durationBreakTable').show();

    });
    $("#editShiftModal #btnStartEndBreak").click(function (e) {
        //e.preventDefault();
        $("#editShiftModal #btnDurationBreak").prop('checked', false);
        //$("#editShiftModal #btnDurationBreak").addClass('btn-secondary').removeClass('btn-brand');
        //$("#editShiftModal #btnStartEndBreak").addClass('btn-brand').removeClass('btn-secondary');
        $('#editShiftModal #durationBreakTable').hide();
        $('#editShiftModal #startEndBreaksPanel').show();
    });
        editShiftDynamicTable.Init();


        $("#editShiftModal .btnSave").click(function (event) {
            console.log("btnSave.clicked");
            event.preventDefault();
            var button = event.currentTarget;
            setButtonToWait($(button));       
            if ($('#copyShiftPanel').is(':visible')) {                
                scheduleService.CopyShift($('#editShiftForm #Id').val(), $('#editShiftModal #Quantity').val(), $('#editShiftForm').serializeArray()).done(function (data) {
                    $("#editShiftModal").modal('toggle');
                    notificationService.ShowSuccess("Shift Copied");
                }).always(function () {
                    setButtonToActive($(button));
                    refreshUi();
                });
            } else {
                var published = $('#editShiftModal #Published').val();
                $('#editShiftModal #Published').val('False');
                setBreaksForSave('#editShiftModal');
                scheduleService.UpdateShift($('#editShiftForm #Id').val(), $('#editShiftForm').serializeArray()).done(function (data) {
                    $("#editShiftModal").modal('toggle');
                    if (published === 'true') {
                        notificationService.ShowSuccess("Shift Unpublished");
                    } else {
                        notificationService.ShowSuccess("Shift Saved");
                    }
                }).always(function () {
                    setButtonToActive($(button));
                    refreshUi();
                });
            }
            
        });
        $('#editShiftModal .btnPublish').click(function (event) {
            console.log("btnPublish.clicked");
            event.preventDefault();
            var button = event.currentTarget;
            setButtonToWait($(button));
            $('#editShiftModal #Published').val('True');
            setBreaksForSave('#editShiftModal');
            scheduleService.UpdateShift($('#editShiftForm #Id').val(), $('#editShiftForm').serializeArray()).done(function (data) {
                $("#editShiftModal").modal('toggle');
                notificationService.ShowSuccess("Shift Saved & Published");
            }).always(function () {
                setButtonToActive($(button));
                refreshUi();
            });
        });
        $('#editShiftModal .btnDelete').click(function (event) {
            console.log("btnDelete.clicked");
            event.preventDefault();
            swal({
                title: "Are you sure?",
                text: "You won't be able to revert this!",
                type: "warning",
                showCancelButton: !0,
                confirmButtonText: "Yes, delete the shift",
                confirmButtonClass: 'btn btn-danger',
            }).then(function (e) {
                if (e.value) {
                    var button = event.currentTarget;
                    setButtonToWait($(button));
                    $('#editShiftModal #Published').val('False');
                    scheduleService.DeleteShift($('#editShiftForm #Id').val()).done(function (data) {
                        $("#editShiftModal").modal('toggle');
                        notificationService.ShowSuccess("Shift Deleted");
                    }).always(function () {
                        setButtonToActive($(button));
                        refreshUi();
                    });
                }
            });
            
        });

        $("#clearShiftsButton").click(function (e) {
            swal({
                title: "Are you sure?",
                text: "You won't be able to revert this!",
                type: "warning",
                showCancelButton: !0,
                confirmButtonText: "Yes, clear the shifts",
                confirmButtonClass: 'btn btn-danger',
            }).then(function (e) {
                if (e.value) {
                    var view = $('#schedule_calendar').fullCalendar('getView');
                    var events = $('#schedule_calendar').fullCalendar('clientEvents', function(event) {
                        return event.start >= view.start && event.end <= view.end && event.eventTypeId === eventTypeEnum.Shift;
                    });
                   
                    var shifts = events.map(mapEventToShiftDto);
                    var shiftIds = shifts.map(function (s) {                
                        return s.Id;
                    });
                    scheduleService.DeleteShifts(shiftIds).done(function (data) {
                        notificationService.ShowSuccess("Shifts Cleared");
                    }).fail(function () {
                        notificationService.ShowError("Shifts failed to clear");
                    }).always(function () {
                        refreshUi();
                    });
                }
            });
        });

        $("#publishShiftsButton").click(function (event) {
                        var view = $('#schedule_calendar').fullCalendar('getView');
                        var eventsNotPublished = $('#schedule_calendar').fullCalendar('clientEvents',
                            function(event) {
                                return event.start >= view.start &&
                                    event.end <= view.end &&
                                    !event.published && event.resourceId != '0' &&
                                    event.eventTypeId === eventTypeEnum.Shift;
                });
            var resources = $('#schedule_calendar').fullCalendar('getResources');
            resources = resources.filter(function(res) {
                return res.id != '0';
            });
            if (eventsNotPublished.length === 1) {
                $("#publishScheduleDates").text(view.title + ": 1 Shift");
            } else {
                $("#publishScheduleDates").text(view.title + ": " + eventsNotPublished.length + " Shifts");
            }
            if (resources.length === 1) {
                $("#publishScheduleAndNotifyButton").html("Publish & notify 1 employee<br />(Only employees currently viewable on calendar)");
            } else {
                $("#publishScheduleAndNotifyButton").html("Publish & notify " + resources.length + " employees<br />(Only employees currently viewable on calendar)");
            }
            

            $("#publishScheduleModal").modal('toggle');

            //swal({
            //    title: "Are you sure?",
            //    text: "This will publish all unpublished shifts in this view",
            //    type: "question",
            //    showCancelButton: !0,
            //    confirmButtonText: "Yes, publish the shifts",
            //    confirmButtonClass: 'btn btn-primary'
            //}).then(function (e) {
            //    if (e.value) {
            //        try {
            //            var locationIds = $('#location-select').val();
            //            var jobCodeIds = $('#department-select').val();
            //            var positionIds = $('#position-select').val();
            //            var employeeIds = $('#employee-select').val();

            //            var view = $('#schedule_calendar').fullCalendar('getView');
            //            //var eventsNotPublished = $('#schedule_calendar').fullCalendar('clientEvents',
            //            //    function(event) {
            //            //        return event.start >= view.start &&
            //            //            event.end <= view.end &&
            //            //            !event.published &&
            //            //            event.eventTypeId === eventTypeEnum.Shift;
            //            //    });
                        
            //            //var shifts = eventsNotPublished.map(mapEventToShiftDto);
            //            //shifts = shifts.map(function(s) {
            //            //    s.Published = true;
            //            //    return s;
            //            //});
            //            scheduleService.PublishSchedule(view.start, view.end, locationIds, jobCodeIds, positionIds, employeeIds).done(function(data) {
            //                notificationService.ShowSuccess("Shifts Published");
            //            }).fail(function() {
            //                notificationService.ShowError("Shifts failed to publish");
            //            }).always(function() {
            //                refreshUi();
            //            });
            //        } catch (err) {
            //            alert(err);
            //        }
            //    }
            //});
        });

        $("#publishScheduleAndNotifyButton").click(function(event) {
            try {
                var locationIds = $('#location-select').val();
                var jobCodeIds = $('#department-select').val();
                var positionIds = $('#position-select').val();
                var employeeIds = $('#employee-select').val();

                var view = $('#schedule_calendar').fullCalendar('getView');
                //var eventsNotPublished = $('#schedule_calendar').fullCalendar('clientEvents',
                //    function(event) {
                //        return event.start >= view.start &&
                //            event.end <= view.end &&
                //            !event.published &&
                //            event.eventTypeId === eventTypeEnum.Shift;
                //    });

                //var shifts = eventsNotPublished.map(mapEventToShiftDto);
                //shifts = shifts.map(function(s) {
                //    s.Published = true;
                //    return s;
                //});
                $("#publishScheduleModal").modal('toggle');
                scheduleService.PublishSchedule(view.start, view.end, locationIds, jobCodeIds, positionIds, employeeIds, true)
                    .done(function(data) {
                        notificationService.ShowSuccess("Shifts Published");
                    }).fail(function() {
                        notificationService.ShowError("Shifts failed to publish");
                    }).always(function() {
                        refreshUi();
                    });
            } catch (err) {
                alert(err);
            }
        });

        $("#publishScheduleNoNotificationButton").click(function (event) {
            try {
                var locationIds = $('#location-select').val();
                var jobCodeIds = $('#department-select').val();
                var positionIds = $('#position-select').val();
                var employeeIds = $('#employee-select').val();

                var view = $('#schedule_calendar').fullCalendar('getView');
                //var eventsNotPublished = $('#schedule_calendar').fullCalendar('clientEvents',
                //    function(event) {
                //        return event.start >= view.start &&
                //            event.end <= view.end &&
                //            !event.published &&
                //            event.eventTypeId === eventTypeEnum.Shift;
                //    });

                //var shifts = eventsNotPublished.map(mapEventToShiftDto);
                //shifts = shifts.map(function(s) {
                //    s.Published = true;
                //    return s;
                //});
                $("#publishScheduleModal").modal('toggle');
                scheduleService.PublishSchedule(view.start, view.end, locationIds, jobCodeIds, positionIds, employeeIds, false)
                    .done(function (data) {
                        notificationService.ShowSuccess("Shifts Published");
                    }).fail(function () {
                        notificationService.ShowError("Shifts failed to publish");
                    }).always(function () {
                        refreshUi();
                    });
            } catch (err) {
                alert(err);
            }
        });


        $("#unpublishShiftsButton").click(function (event) {
            swal({
                title: "Are you sure?",
                text: "This will unpublish all published shifts in this view",
                type: "question",
                showCancelButton: !0,
                confirmButtonText: "Yes, unpublish the shifts",
                confirmButtonClass: 'btn btn-primary'
            }).then(function (e) {
                if (e.value) {
                    var view = $('#schedule_calendar').fullCalendar('getView');
                    var eventsPublished = $('#schedule_calendar').fullCalendar('clientEvents', function (event) {
                        return event.start >= view.start && event.end <= view.end && event.published && event.eventTypeId === eventTypeEnum.Shift;
                    });
                    //alert("Will publish " + eventsNotPublished.length + ' shifts');
                    var shifts = eventsPublished.map(mapEventToShiftDto);
                    shifts = shifts.map(function (s) {
                        s.Published = false;
                        return s;
                    });
                    scheduleService.UpdateShifts(shifts).done(function (data) {
                        notificationService.ShowSuccess("Shifts Unpublished");
                    }).fail(function () {
                        notificationService.ShowError("Shifts failed to unpublish");
                    }).always(function () {
                        refreshUi();
                    });
                }
            });
        });

        $("#copyPreviousWeekButton").click(function (event) {
            swal({
                title: "Are you sure?",
                text: "This will copy the previous week's shifts based on your current filter selections. This will not copy PTO.",
                type: "question",
                showCancelButton: !0,
                confirmButtonText: "Yes, copy the previous week",
                confirmButtonClass: 'btn btn-primary'
            }).then(function (e) {
                if (e.value) {
                    var locationIds = $('#location-select').val();
                    var jobCodeIds = $('#department-select').val();
                    var positionIds = $('#position-select').val();

                    //notificationService.ShowError("Copy is not yet implemented");
                    var view = $('#schedule_calendar').fullCalendar('getView');
                   
                    scheduleService.CopyPreviousWeek(view.start, locationIds, jobCodeIds, positionIds).done(function (data) {
                        notificationService.ShowSuccess("Previous Week Copied");
                    }).fail(function () {
                        notificationService.ShowError("Copy from previous week failed");
                    }).always(function () {
                        refreshUi();
                    });
                }
            });
        });

        $("#createTemplateButton").click(function (event) {
            swal({
                title: 'Enter the new template name',
                input: 'text',
                inputValue: '',
                showCancelButton: true,
                inputValidator: function(value)  {
                    return !value && 'Template name is required';
                }
                //title: "Are you sure?",
                //text: "This will copy the previous week's shifts",
                //type: "question",
                //showCancelButton: !0,
                //confirmButtonText: "Yes, copy the previous week",
                //confirmButtonClass: 'btn btn-primary',
            }).then(function (e) {
                if (e.value) {
                    notificationService.ShowError("Create template is not implemented");
                    //var locationIds = $('#location-select').val();
                    //var jobCodeIds = $('#department-select').val();
                    //var positionIds = $('#position-select').val();

                    ////notificationService.ShowError("Copy is not yet implemented");
                    //var view = $('#schedule_calendar').fullCalendar('getView');

                    //scheduleService.CopyPreviousWeek(view.start, locationIds, jobCodeIds, positionIds).done(function (data) {
                    //    notificationService.ShowSuccess("Previous Week Copied");
                    //}).fail(function () {
                    //    notificationService.ShowError("Copy from previous week failed");
                    //}).always(function () {
                    //    refreshUi();
                    //});
                }
            });
        });

        $("#loadTemplateButton").click(function (event) {
            swal({
                title: 'Load a template',
                input: 'select',
                inputOptions: {
                    'SRB': 'Serbia',
                    'UKR': 'Ukraine',
                    'HRV': 'Croatia'
                },
                inputPlaceholder: 'Select template',
                showCancelButton: true,
                inputValidator: function(value)  {
                    return new Promise(function(resolve) {
                        if (value === '') {
                            resolve('You need to select a template');
                        } else {
                            resolve();
                        }
                    });
                }
            }).then(function (e) {
                if (e.value) {
                    notificationService.ShowError("Load template is not implemented");
                    //var locationIds = $('#location-select').val();
                    //var jobCodeIds = $('#department-select').val();
                    //var positionIds = $('#position-select').val();

                    ////notificationService.ShowError("Copy is not yet implemented");
                    //var view = $('#schedule_calendar').fullCalendar('getView');

                    //scheduleService.CopyPreviousWeek(view.start, locationIds, jobCodeIds, positionIds).done(function (data) {
                    //    notificationService.ShowSuccess("Previous Week Copied");
                    //}).fail(function () {
                    //    notificationService.ShowError("Copy from previous week failed");
                    //}).always(function () {
                    //    refreshUi();
                    //});
                }
            });
        });

        $('#btnPrint').click(function(event) {
            PrintElem("schedule_calendar");
        });

        function PrintElem(elem) {
            console.log(document.getElementById(elem).innerHTML);
            var mywindow = window.open('', 'PRINT', 'height=800,width=800');

            mywindow.document.write('<html><head><title>' + document.title + '</title>');
            //mywindow.document.write('<link href="/dist/v-636753780425282515/bundle.css" rel="stylesheet" type="text/css" />');
            mywindow.document.write('<link href="/Scripts/scheduler.min.css" rel="stylesheet" />');
            mywindow.document.write('<link href="https://fullcalendar.io/releases/fullcalendar/3.9.0/fullcalendar.print.min.css" rel="stylesheet" media="print" />');
            mywindow.document.write('</head><body >');
            //mywindow.document.write('<h1>' + document.title + '</h1>');
            mywindow.document.write(document.getElementById(elem).innerHTML);
            mywindow.document.write('</body></html>');

            mywindow.document.close(); // necessary for IE >= 10
            mywindow.focus(); // necessary for IE >= 10*/

            mywindow.print();
            mywindow.close();

            return true;
        }


        $("#createShiftModal #StartTime").on("dp.change", function (e) {
            var newDate = moment($('#createShiftModal #StartDateTime').val()).startOf('day');
            //console.log("EndTime input: " + $('#createShiftModal #EndTime').val());
            var newTime = moment($('#createShiftModal #StartTime').val(), 'h:mm A');
            //console.log("EndTime: " + newTime.format());

            var newDateTime = moment(newDate).add(newTime.hour(), 'hour').add(newTime.minute(), 'minute')
                .format('MM/DD/Y h:mm A');
            //console.log("EndDateTime: " + newEndDateTime);
            $('#createShiftModal #StartDateTime').val(newDateTime);
            console.log("StartDateTime input: " + $('#createShiftModal #StartDateTime').val());
        });
        $("#createShiftModal #EndTime").on("dp.change", function (e) {
            var newDate = moment($('#createShiftModal #EndDate').val());
            //console.log("EndTime input: " + $('#createShiftModal #EndTime').val());
            var newTime = moment($('#createShiftModal #EndTime').val(), 'h:mm A');
            //console.log("EndTime: " + newTime.format());

            var newEndDateTime = moment(newDate).add(newTime.hour(), 'hour').add(newTime.minute(), 'minute')
                .format('MM/DD/Y h:mm A');
            //console.log("EndDateTime: " + newEndDateTime);
            $('#createShiftModal #EndDateTime').val(newEndDateTime);
            console.log("EndDateTime input: " + $('#createShiftModal #EndDateTime').val());
        });

        $('#createShiftModal #EndDate').on('changed.bs.select', function (e, clickedIndex, isSelected, previousValue) {
            var newDate = moment($('#createShiftModal #EndDate').val());
            //console.log("EndTime input: " + $('#createShiftModal #EndTime').val());
            var newTime = moment($('#createShiftModal #EndTime').val(), 'h:mm A');
            //console.log("EndTime: " + newTime.format());

            var newEndDateTime = moment(newDate).add(newTime.hour(), 'hour').add(newTime.minute(), 'minute')
                .format('MM/DD/Y h:mm A');
            //console.log("EndDateTime: " + newEndDateTime);
            $('#createShiftModal #EndDateTime').val(newEndDateTime);
            console.log("EndDateTime input: " + $('#createShiftModal #EndDateTime').val());
        });

        $("#editShiftModal #StartTime").on("dp.change", function (e) {
            var newDate = moment($('#editShiftModal #StartDateTime').val()).startOf('day');
            //console.log("EndTime input: " + $('#editShiftModal #EndTime').val());
            var newTime = moment($('#editShiftModal #StartTime').val(), 'h:mm A');
            //console.log("EndTime: " + newTime.format());

            var newDateTime = moment(newDate).add(newTime.hour(), 'hour').add(newTime.minute(), 'minute')
                .format('MM/DD/Y h:mm A');
            //console.log("EndDateTime: " + newEndDateTime);
            $('#editShiftModal #StartDateTime').val(newDateTime);
            console.log("StartDateTime input: " + $('#editShiftModal #StartDateTime').val());
        });
        $("#editShiftModal #EndTime").on("dp.change", function (e) {
            var newDate = moment($('#editShiftModal #EndDate').val());
            //console.log("EndTime input: " + $('#editShiftModal #EndTime').val());
            var newTime = moment($('#editShiftModal #EndTime').val(), 'h:mm A');
            //console.log("EndTime: " + newTime.format());

            var newEndDateTime = moment(newDate).add(newTime.hour(), 'hour').add(newTime.minute(), 'minute')
                .format('MM/DD/Y h:mm A');
            //console.log("EndDateTime: " + newEndDateTime);
            $('#editShiftModal #EndDateTime').val(newEndDateTime);
            console.log("EndDateTime input: " + $('#editShiftModal #EndDateTime').val());
        });

        $('#editShiftModal #EndDate').on('changed.bs.select', function (e, clickedIndex, isSelected, previousValue) {
            var newDate = moment($('#editShiftModal #EndDate').val());
            //console.log("EndTime input: " + $('#editShiftModal #EndTime').val());
            var newTime = moment($('#editShiftModal #EndTime').val(), 'h:mm A');
            //console.log("EndTime: " + newTime.format());

            var newEndDateTime = moment(newDate).add(newTime.hour(), 'hour').add(newTime.minute(), 'minute')
                .format('MM/DD/Y h:mm A');
            //console.log("EndDateTime: " + newEndDateTime);
            $('#editShiftModal #EndDateTime').val(newEndDateTime);
            console.log("EndDateTime input: " + $('#editShiftModal #EndDateTime').val());
        });
   
        $(".timepicker").datetimepicker({
            format: 'LT',
            widgetPositioning: {
                horizontal: 'auto',
                vertical: 'bottom'
            },
            sideBySide: true,
            icons: {
                time: 'fa fa-time',
                date: 'fa fa-calendar',
                up: 'fa fa-chevron-up',
                down: 'fa fa-chevron-down',
                previous: 'fa fa-chevron-left',
                next: 'fa fa-chevron-right',
                today: 'fa fa-screenshot',
                clear: 'fa fa-trash',
                close: 'fa fa-remove'
            }
        });  

        
        $('.time-picker').timepicker({
            format: "HH:ii",
            minuteStep: 1,
            defaultTime: '00:00',
            showSeconds: false,
            showMeridian: false,
            snapToStep: true
        });

        // Also show the timepicker widget on timepicker little button click
        $(".timepicker-group button").off('click');
        $(".timepicker-group button").click(function (e) {
            var that = this;
            setTimeout(function () {
                $(that).parent().parent().find(".timepicker").click();
            });
        });
    }

    function initControls() {
        $(".timepicker").datetimepicker({
            format: 'LT',
            widgetPositioning: {
                horizontal: 'auto',
                vertical: 'bottom'
            },
            sideBySide: true,
            icons: {
                time: 'fa fa-time',
                date: 'fa fa-calendar',
                up: 'fa fa-chevron-up',
                down: 'fa fa-chevron-down',
                previous: 'fa fa-chevron-left',
                next: 'fa fa-chevron-right',
                today: 'fa fa-screenshot',
                clear: 'fa fa-trash',
                close: 'fa fa-remove'
            }
        });  

        
    }


    function refreshUi() {
        $('#schedule_calendar').fullCalendar('refetchEvents');
    }

    function setButtonToWait(button) {
        button.prop("disabled", "disabled");
        button.addClass('disabled');
        button.addClass('m-loader m-loader--brand m-loader--right');
        //button.find('i').removeClass('fa-check');
    }

    function setButtonToActive(button) {
        button.prop("disabled", null);
        button.removeClass('disabled');
        button.removeClass('m-loader m-loader--brand m-loader--right');
        //button.find('i').addClass('fa-check');
    }

    function mapEventToShiftDto(event) {
        if (parseInt(event.resourceId) === 0) {
            event.resourceId = null;
        }
        var shift = {
            Id: event.id,
            StaffId: event.resourceId,
            StartDateTime: event.start.toISOString(),
            EndDateTime: event.end.toISOString(),
            LocationId: event.locationid,
            JobCodeId: event.jobcodeid,
            Positionid: event.positionid,
            Shiftcolorid: event.shiftcolorid,
            Notes: event.notes,
            Published: event.published
        };
        return shift;
    }
}