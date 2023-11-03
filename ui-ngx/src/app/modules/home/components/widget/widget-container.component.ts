///
/// Copyright © 2016-2023 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import { PageComponent } from '@shared/components/page.component';
import { DashboardWidget, DashboardWidgets } from '@home/models/dashboard-component.models';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { SafeStyle } from '@angular/platform-browser';
import { guid, isNotEmptyStr } from '@core/utils';
import cssjs from '@core/css/css';
import { DOCUMENT } from '@angular/common';
import { GridsterItemComponent } from 'angular-gridster2';
import {WidgetContext} from "@home/models/widget-component.models";
import {Datasource, DatasourceData} from "@shared/models/widget.models";
import { BookType, writeFile, WorkBook, utils, WorkSheet } from 'xlsx';
import _ from 'lodash';
import {MatMenuTrigger} from "@angular/material/menu";

export enum WidgetComponentActionType {
  MOUSE_DOWN,
  CLICKED,
  CONTEXT_MENU,
  EDIT,
  EXPORT,
  REMOVE
}

export class WidgetComponentAction {
  event: MouseEvent;
  actionType: WidgetComponentActionType;
}

// @dynamic
@Component({
  selector: 'tb-widget-container',
  templateUrl: './widget-container.component.html',
  styleUrls: ['./widget-container.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WidgetContainerComponent extends PageComponent implements OnInit, AfterViewInit, OnDestroy {

  @HostBinding('class')
  widgetContainerClass = 'tb-widget-container';

  @ViewChild('tbWidgetElement', {static: true})
  tbWidgetElement: ElementRef;

  @Input()
  gridsterItem: GridsterItemComponent;

  @Input()
  widget: DashboardWidget;

  @Input()
  dashboardStyle: {[klass: string]: any};

  @Input()
  backgroundImage: SafeStyle | string;

  @Input()
  isEdit: boolean;

  @Input()
  isMobile: boolean;

  @Input()
  dashboardWidgets: DashboardWidgets;

  @Input()
  isEditActionEnabled: boolean;

  @Input()
  isExportActionEnabled: boolean;

  @Input()
  isRemoveActionEnabled: boolean;

  @Input()
  disableWidgetInteraction = false;

  @Output()
  widgetFullscreenChanged: EventEmitter<boolean> = new EventEmitter<boolean>();

  @Output()
  widgetComponentAction: EventEmitter<WidgetComponentAction> = new EventEmitter<WidgetComponentAction>();

  @ViewChild('menuTrigger') trigger: MatMenuTrigger;

  private cssClass: string;

  constructor(protected store: Store<AppState>,
              private cd: ChangeDetectorRef,
              private renderer: Renderer2,
              @Inject(DOCUMENT) private document: Document) {
    super(store);
  }

  ngOnInit(): void {
    this.widget.widgetContext.containerChangeDetector = this.cd;
    const cssString = this.widget.widget.config.widgetCss;
    if (isNotEmptyStr(cssString)) {
      const cssParser = new cssjs();
      cssParser.testMode = false;
      this.cssClass = 'tb-widget-css-' + guid();
      this.renderer.addClass(this.gridsterItem.el, this.cssClass);
      cssParser.cssPreviewNamespace = this.cssClass;
      cssParser.createStyleElement(this.cssClass, cssString);
    }
  }

  ngAfterViewInit(): void {
    this.widget.widgetContext.$widgetElement = $(this.tbWidgetElement.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.cssClass) {
      const el = this.document.getElementById(this.cssClass);
      if (el) {
        el.parentNode.removeChild(el);
      }
    }
  }

  isHighlighted(widget: DashboardWidget) {
    return this.dashboardWidgets.isHighlighted(widget);
  }

  isNotHighlighted(widget: DashboardWidget) {
    return this.dashboardWidgets.isNotHighlighted(widget);
  }

  onFullscreenChanged(expanded: boolean) {
    if (expanded) {
      this.renderer.addClass(this.tbWidgetElement.nativeElement, this.cssClass);
    } else {
      this.renderer.removeClass(this.tbWidgetElement.nativeElement, this.cssClass);
    }
    this.widgetFullscreenChanged.emit(expanded);
  }

  onMouseDown(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.MOUSE_DOWN
    });
  }

  onClicked(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.CLICKED
    });
  }

  onContextMenu(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.CONTEXT_MENU
    });
  }

  onEdit(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.EDIT
    });
  }

  onExport(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.EXPORT
    });
  }

  onRemove(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.REMOVE
    });
  }

  exportData($event: Event, ctx: WidgetContext, fileType) {
    if ($event) {
      $event.stopPropagation();
    }
    const export_data = this.data_format(ctx.datasources, ctx.data);
    this.export(export_data, fileType, ctx.widgetConfig.title);
    //下载结束关闭菜单
    this.trigger.toggleMenu();
  }

  /**
   * 将数据格式化为下面类似格式
   [
   ['name', 'type', 'timestamp', 'dataKey1','dataKey1',...],
   ['BusA', 'Device', 1617851898356, 9.3,'on',...],
   ['BusB', 'Device', 1617851898356, 9.3,'off',...],
   ['AssertA', 'Assert', 1617851898356, 9.3,'location1',...],
   ['AssertB', 'Assert', 1617851898356, 9.3,'location2',...]
   ]
   * @param datasources 使用console.log(datasources)查看datasources具体数据格式
   * @param data 使用console.log(data)查看data具体数据格式
   */
  data_format(datasources: Datasource[], data: DatasourceData[]) {
    let aggregation = [];
    const header = ['timestamp', 'name', 'type'];
    let firstHeader = true;
    datasources.forEach(ds => {
      let entity = [];
      let firstTs = true;
      ds.dataKeys.forEach(dk => {
        if (firstHeader) {
          header.push(dk.label || dk.name);
        }
        data.forEach(dt => {
          if (dt.dataKey.name === dk.name && dt.datasource.name === ds.entityName) {
            entity.push([dk.name, _.flatMap(dt.data, (arr) => arr[1])]);
            if ((dt.data[0] && dt.data[0][0]) && firstTs) {
              firstTs = false;
              entity.splice(0, 0, ['timestamp', _.flatMap(dt.data, (arr) => arr[0].toString())]);
            }
          }
        });
      });
      firstHeader = false;
      aggregation.push([ds.entityName, ds.entityType, entity]);
    });
    // console.log(aggregation);
    let result = [];
    aggregation.forEach((item, i) => {
      let entityName = item[0];
      let entityType = item[1];
      let v = item[2];
      //处理没有数据的情况
      const dataKeyData = v.filter(item => item[1].length > 0)[0]
      if(dataKeyData){
        for (let i = 0; i < dataKeyData[1].length; i++) {
          let row = [];
          v.forEach((_item, j) => {
            if (j == 0) {
              row[0] = _item[1][i];
              row[1] = entityName;
              row[2] = entityType;
            } else {
              row[j + 2] = _item[1][i] ? _item[1][i] : '';
            }
          });
          result.push(row);
        }
      }
    });
    result.splice(0, 0, header);
    const index = result[0].indexOf('timestamp');
    result = result.map((item, i) => {
      if (i > 0) {
        item[index] = new Date(Number(item[index])).toLocaleString();
      }
      return item;
    })
    return result;
  }

  //数据导出到浏览器下载
  export(data: Array<any>, fileType: BookType, title: string): void {
    const ws: WorkSheet = utils.aoa_to_sheet(data);
    ws['!cols'] = ([
      { wch: 13 }
    ]);
    const output_file_name = title + '-' + Date.parse(new Date().toString()) + '.' + fileType;
    if (fileType === 'csv') {
      const csv = utils.sheet_to_csv(ws, { FS: ';', RS: '\n' });
      this.export_csv(csv, output_file_name);
    } else {
      const wb: WorkBook = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Sheet1');
      writeFile(wb, output_file_name, { bookType: fileType, type: 'array'});
    }
  }

//导出csv
  export_csv(data, fileName) {
    const uri = 'data:text/csv;charset=utf-8,\ufeff' + encodeURIComponent(data);
    const downloadLink = document.createElement('a');
    downloadLink.href = uri;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
}
